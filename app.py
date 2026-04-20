#!/usr/bin/env python3
import sys
import os
import webview


def get_html_path() -> str:
    # When frozen by PyInstaller, data files are unpacked to sys._MEIPASS
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'odc_creator.html')


if __name__ == '__main__':
    html_path = get_html_path()
    window = webview.create_window(
        title='ODC Creator — Contestation',
        url=f'file://{html_path}',
        width=1100,
        height=820,
        resizable=True,
        min_size=(800, 600),
    )
    webview.start(gui='gtk')
