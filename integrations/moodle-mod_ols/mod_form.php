<?php
defined('MOODLE_INTERNAL') || die();
require_once($CFG->dirroot . '/course/moodleform_mod.php');
class mod_ols_mod_form extends moodleform_mod {
    public function definition() {
        $mform = $this->_form;
        $mform->addElement('header', 'general', get_string('general', 'form'));
        $mform->addElement('text', 'name', get_string('olsname', 'ols'), array('size' => '64'));
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');
        $this->standard_intro_elements(get_string('intro', 'ols'));
        $mform->addElement('text', 'lessonurl', get_string('lessonurl', 'ols'), array('size' => '80'));
        $mform->setType('lessonurl', PARAM_URL);
        $mform->addRule('lessonurl', null, 'required', null, 'client');
        $mform->addElement('float', 'grademax', get_string('grademax', 'ols'));
        $mform->setType('grademax', PARAM_FLOAT);
        $mform->setDefault('grademax', 100);
        $this->standard_grading_coursemodule_elements();
        $this->add_action_buttons();
    }
}
