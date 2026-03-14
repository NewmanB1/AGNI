<?php
// This file is part of Moodle - https://moodle.org/
// mod_ols - Display OLS lesson in iframe; grade passback via postMessage.

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/gradelib.php');

$id = required_param('id', PARAM_INT);
$cm = get_coursemodule_from_id('ols', $id, 0, false, MUST_EXIST);
$ols = $DB->get_record('ols', array('id' => $cm->instance), '*', MUST_EXIST);
$course = $DB->get_record('course', array('id' => $cm->course), '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/ols:view', $context);

$url = new moodle_url('/mod/ols/view.php', array('id' => $cm->id));
$PAGE->set_url($url);
$PAGE->set_title($ols->name);
$PAGE->set_heading($course->shortname);
$PAGE->set_context($context);

echo $OUTPUT->header();
echo $OUTPUT->heading(format_string($ols->name));

if (trim(strip_tags($ols->intro))) {
    echo $OUTPUT->box(format_module_intro('ols', $ols, $cm->id), 'generalbox mod_introbox', 'olsintro');
}

$lessonurl = s($ols->lessonurl);
$cmid = (int) $cm->id;
$sesskey = sesskey();
echo html_writer::tag('iframe', '', array(
    'id' => 'ols-lesson-frame',
    'src' => $lessonurl,
    'class' => 'ols-iframe',
    'style' => 'width:100%;height:600px;border:0;',
    'allow' => 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope',
));

$PAGE->requires->js_call_amd('mod_ols/grade_listener', 'init', array($cmid, $sesskey));
echo $OUTPUT->footer();
