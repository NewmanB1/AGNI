/**
 * mod_ols grade listener - listens for ols.lessonComplete postMessage from iframe
 * and submits grade to Moodle via AJAX.
 * See docs/integrations/MOODLE-MOD-OLS-GUIDE.md
 */
define(['core/ajax', 'core/notification'], function(ajax, notification) {
    return {
        init: function(cmId, sessKey) {
            window.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'ols.lessonComplete' && event.data.mastery != null) {
                    ajax.call([{
                        methodname: 'mod_ols_external_submit_grade',
                        args: {cmid: cmId, sesskey: sessKey, mastery: event.data.mastery}
                    }])[0].then(function() {
                        notification.addNotification({
                            message: 'Grade submitted.',
                            type: 'success'
                        });
                    }).catch(function() {
                        notification.addNotification({
                            message: 'Failed to submit grade.',
                            type: 'error'
                        });
                    });
                }
            });
        }
    };
});
