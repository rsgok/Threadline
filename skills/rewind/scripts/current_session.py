#!/usr/bin/env python3
"""Open-link helper. The caller, never the server, supplies the current thread."""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--thread', default=os.environ.get('CODEX_THREAD_ID', ''))
args = parser.parse_args()
if not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', args.thread):
    sys.exit('无法确定当前 Codex 会话 ID；请从目标会话调用，不会猜测最近会话。')
base = 'http://127.0.0.1:43127'

def healthy():
    try:
        with urllib.request.urlopen(base + '/health', timeout=1) as response:
            return json.load(response).get('app') == 'rewind-web'
    except Exception:
        return False

if not healthy():
    subprocess.run(['launchctl', 'kickstart', f'gui/{os.getuid()}/local.rewind.web'], capture_output=True, check=False)
    for _ in range(12):
        if healthy():
            break
        time.sleep(0.2)
    else:
        sys.exit('Rewind 服务尚未安装或未启动。请先运行 Rewind 项目的 scripts/start-web.sh。')

print(json.dumps({'threadID': args.thread, 'url': base + '/?thread=' + args.thread + '&view=import&panel=1'}, ensure_ascii=False))
