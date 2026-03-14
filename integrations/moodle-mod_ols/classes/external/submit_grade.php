<?php
// External API for mod_ols grade submission from postMessage.
defined('MOODLE_INTERNAL') || die();
require_once($GLOBALS['CFG']->libdir . '/externallib.php');

class mod_ols_external_submit_grade extends external_api {
    public static function execute_parameters() {
        return new external_function_parameters(array(
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'sesskey' => new external_value(PARAM_RAW, 'Session key'),
            'mastery' => new external_value(PARAM_FLOAT, 'Mastery score 0-1 from ols.lessonComplete')
        ));
    }

    public static function execute($cmid, $sesskey, $mastery) {
        global $USER;
        $params = self::validate_parameters(self::execute_parameters(),
            array('cmid' => $cmid, 'sesskey' => $sesskey, 'mastery' => $mastery));
        if (!confirm_sesskey($params['sesskey'])) {
            throw new moodle_exception('invalidsesskey');
        }
        $cm = get_coursemodule_from_id('ols', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_capability('mod/ols:view', $context);
        $mastery = max(0, min(1, (float) $params['mastery']));
        ols_grade_update($params['cmid'], $USER->id, $mastery);
        return array('success' => true);
    }

    public static function execute_returns() {
        return new external_single_structure(array(
            'success' => new external_value(PARAM_BOOL, 'Whether grade was saved')
        ));
    }
}
