<?php
// This file is part of Moodle - https://moodle.org/
// mod_ols - OLS activity module. See MOODLE-MOD-OLS-GUIDE.md.

defined('MOODLE_INTERNAL') || die();

/**
 * Supported features.
 */
function ols_supports($feature) {
    switch ($feature) {
        case FEATURE_GROUPS:
            return false;
        case FEATURE_GROUPINGS:
            return false;
        case FEATURE_MOD_INTRO:
            return true;
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return false;
        case FEATURE_COMPLETION_HAS_RULES:
            return false;
        case FEATURE_GRADE_HAS_GRADE:
            return true;
        case FEATURE_GRADE_OUTCOMES:
            return false;
        case FEATURE_BACKUP_MOODLE2:
            return true;
        case FEATURE_SHOW_DESCRIPTIONS:
            return true;
        default:
            return null;
    }
}

/**
 * Add OLS instance.
 */
function ols_add_instance($ols) {
    global $DB;
    $ols->timecreated = time();
    $ols->timemodified = $ols->timecreated;
    $id = $DB->insert_record('ols', $ols);
    if ($id) {
        ols_grade_item_update($ols);
    }
    return $id;
}

/**
 * Update OLS instance.
 */
function ols_update_instance($ols) {
    global $DB;
    $ols->timemodified = time();
    $ols->id = $ols->instance;
    $result = $DB->update_record('ols', $ols);
    if ($result) {
        $ols = $DB->get_record('ols', array('id' => $ols->id), '*', MUST_EXIST);
        ols_grade_item_update($ols);
    }
    return $result;
}

/**
 * Create or update grade item for this activity.
 */
function ols_grade_item_update($ols, $grades = null) {
    global $CFG;
    require_once($CFG->libdir . '/gradelib.php');
    $params = array(
        'itemname' => $ols->name,
        'gradetype' => GRADE_TYPE_VALUE,
        'grademax' => (float) $ols->grademax,
        'grademin' => 0,
    );
    return grade_update('mod/ols', $ols->course, 'mod', 'ols', $ols->id, 0, $grades, $params);
}

/**
 * Delete OLS instance.
 */
function ols_delete_instance($id) {
    global $DB;
    if (!$ols = $DB->get_record('ols', array('id' => $id))) {
        return false;
    }
    grade_update('mod/ols', $ols->course, 'mod', 'ols', $ols->id, 0, null, array('deleted' => 1));
    $DB->delete_records('ols', array('id' => $ols->id));
    return true;
}

/**
 * Return grade for user (0 = no grade).
 */
function ols_get_user_grades($ols, $userid = 0) {
    global $DB;
    if ($userid) {
        $user = $DB->get_record('user', array('id' => $userid));
        $grades = grade_get_grades($ols->course, 'mod', 'ols', $ols->id, $user->id);
        if (!empty($grades->items[0]->grades)) {
            return $grades->items[0]->grades[$user->id];
        }
    }
    return null;
}

/**
 * Update grade for user from ols.lessonComplete postMessage (mastery 0-1).
 * Called from AJAX/external API.
 */
function ols_grade_update($cmid, $userid, $mastery) {
    global $DB, $CFG;
    require_once($CFG->libdir . '/gradelib.php');

    $cm = get_coursemodule_from_id('ols', $cmid, 0, false, MUST_EXIST);
    $ols = $DB->get_record('ols', array('id' => $cm->instance), '*', MUST_EXIST);
    $grademax = (float) $ols->grademax;
    $rawgrade = $mastery * $grademax;

    $grades = array(
        'userid' => $userid,
        'rawgrade' => $rawgrade,
        'dategraded' => time(),
    );
    return grade_update('mod/ols', $ols->course, 'mod', 'ols', $ols->id, 0, $grades);
}
