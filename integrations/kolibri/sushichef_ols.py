#!/usr/bin/env python3
"""
OLS (Open Lesson Standard) Sushi Chef for Kolibri Studio.

Compiles OLS lessons to HTML, wraps each as an HTML5 App (zip with index.html),
and uploads to a Kolibri channel via Ricecooker.

Usage:
  1. Compile lessons: ./build-lessons.sh  (or npm run build in AGNI root)
  2. Run chef: python sushichef_ols.py --token=YOUR_STUDIO_TOKEN

Prerequisites: AGNI dist/ with .html files, or set OLS_DIST to your HTML output dir.
See docs/integrations/KOLIBRI-INTEGRATION-GUIDE.md.
"""

import os
import shutil
import tempfile
from ricecooker.chefs import SushiChef
from ricecooker.classes.nodes import HTML5AppNode, TopicNode
from ricecooker.classes.files import HTMLZipFile
from ricecooker.classes.licenses import get_license
from ricecooker.utils.zip import create_predictable_zip
from le_utils.constants import licenses
from le_utils.constants.languages import getlang

# Path to compiled OLS HTML (default: AGNI repo dist/)
OLS_DIST = os.environ.get('OLS_DIST', None)
if OLS_DIST is None:
    _agni_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    OLS_DIST = os.path.join(_agni_root, 'dist')


class OLSSushiChef(SushiChef):
    channel_info = {
        'CHANNEL_SOURCE_DOMAIN': 'agni.dev',
        'CHANNEL_SOURCE_ID': 'ols-demo-channel',
        'CHANNEL_TITLE': 'OLS Demo Lessons',
        'CHANNEL_LANGUAGE': 'en',
        'CHANNEL_DESCRIPTION': 'Open Lesson Standard (OLS) interactive lessons with sensors. '
                               'Self-contained HTML bundles for offline use on Kolibri.',
        'CHANNEL_THUMBNAIL': None,
    }

    def _html_to_zip(self, html_path):
        """Wrap a single-file OLS HTML as a zip with index.html at root (required by HTMLZipFile)."""
        webroot = tempfile.mkdtemp(prefix='ols_')
        try:
            index_path = os.path.join(webroot, 'index.html')
            shutil.copy2(html_path, index_path)
            return create_predictable_zip(webroot)
        finally:
            shutil.rmtree(webroot, ignore_errors=True)

    def construct_channel(self, **kwargs):
        channel = self.get_channel(**kwargs)
        dist = OLS_DIST
        if not os.path.isdir(dist):
            raise FileNotFoundError(
                'OLS dist directory not found: {}. '
                'Run build-lessons.sh or npm run build first. '
                'Or set OLS_DIST to your compiled HTML directory.'.format(dist)
            )

        license_obj = get_license(licenses.CC_BY, copyright_holder='AGNI')
        lang = getlang('en').code

        # Optional: group under a topic
        topic = TopicNode(
            source_id='ols-lessons',
            title='OLS Lessons',
            description='Interactive sensor-based lessons in single-file HTML format.',
            language=lang,
        )
        channel.add_child(topic)

        added = 0
        for name in sorted(os.listdir(dist)):
            if not name.endswith('.html'):
                continue
            slug = name[:-5]
            html_path = os.path.join(dist, name)
            if not os.path.isfile(html_path):
                continue

            zip_path = self._html_to_zip(html_path)
            zip_file = HTMLZipFile(path=zip_path, language=lang)
            app_node = HTML5AppNode(
                source_id='ols-' + slug,
                title=slug.replace('-', ' ').replace('_', ' ').title(),
                author='AGNI',
                description='OLS lesson: {}. Runs offline with sensors (accelerometer, haptics).'.format(slug),
                language=lang,
                license=license_obj,
                files=[zip_file],
                derive_thumbnail=True,
            )
            topic.add_child(app_node)
            added += 1

        if added == 0:
            raise ValueError(
                'No .html files found in {}. Compile lessons first.'.format(dist)
            )
        return channel


def main():
    chef = OLSSushiChef()
    chef.main()


if __name__ == '__main__':
    main()
