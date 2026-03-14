<?php
// This file is part of Moodle - mod_ols course index.
defined('MOODLE_INTERNAL') || die();
require_once(__DIR__ . '/../../config.php');
$id = required_param('id', PARAM_INT);
$course = $DB->get_record('course', array('id' => $id), '*', MUST_EXIST);
require_login($course);
$PAGE->set_pagelayout('incourse');
$PAGE->set_url('/mod/ols/index.php', array('id' => $id));
$PAGE->set_title($course->shortname . ': ' . get_string('modulenameplural', 'ols'));
$PAGE->set_heading($course->fullname);
echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('modulenameplural', 'ols'));
$olsinstances = get_all_instances_in_course('ols', $course);
if (empty($olsinstances)) {
    echo $OUTPUT->notification(get_string('nools', 'ols'), 'info');
} else {
    $table = new html_table();
    $table->head = array(get_string('name'), get_string('moduleintro'));
    foreach ($olsinstances as $ols) {
        $url = new moodle_url('/mod/ols/view.php', array('id' => $ols->coursemodule));
        $table->data[] = array(
            html_writer::link($url, $ols->name),
            format_module_intro('ols', $ols, $ols->coursemodule)
        );
    }
    echo html_writer::table($table);
}
echo $OUTPUT->footer();
