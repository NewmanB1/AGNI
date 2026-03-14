<?php
defined('MOODLE_INTERNAL') || die();
$functions = array(
    'mod_ols_external_submit_grade' => array(
        'classname' => 'mod_ols_external_submit_grade',
        'methodname' => 'execute',
        'classpath' => 'mod/ols/classes/external/submit_grade.php',
        'description' => 'Submit grade from ols.lessonComplete postMessage',
        'type' => 'write',
        'ajax' => true,
        'capabilities' => 'mod/ols:view',
    ),
);
