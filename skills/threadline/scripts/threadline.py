#!/usr/bin/env python3
"""Threadline runtime CLI. Python 3 standard library only; stdout is JSON."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


class Failure(Exception):
    def __init__(self, message, status=1):
        super().__init__(message)
        self.status = status


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise Failure(message, 2)


def main():
    parser = Parser(description=__doc__)
    parser.add_argument('--url', default=os.environ.get('THREADLINE_URL', 'http://127.0.0.1:43127'))
    parser.add_argument('--timeout', type=float, default=15)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('health')
    panel = commands.add_parser('panel', help='Return selection URL; never chooses messages')
    panel.add_argument('--thread', default=os.environ.get('CODEX_THREAD_ID', ''))
    ls = commands.add_parser('list')
    ls.add_argument('--query', default='')
    get = commands.add_parser('get')
    get.add_argument('id')
    def fields(p):
        for flag in ['title', 'note', 'question', 'source', 'source-url', 'topic-id']:
            p.add_argument('--' + flag)
        body = p.add_mutually_exclusive_group()
        body.add_argument('--body')
        body.add_argument('--file', help='UTF-8 Markdown file, or - for stdin')
    save = commands.add_parser('save')
    fields(save)
    update = commands.add_parser('update')
    update.add_argument('id')
    update.add_argument('--version', required=True, help='Version returned by get/list; conflicts are not retried')
    fields(update)
    mark = commands.add_parser('mark', help='Record outdated/updated status and reason without changing original text')
    mark.add_argument('id')
    mark.add_argument('--version', required=True)
    mark.add_argument('--status', choices=['outdated', 'updated'], required=True)
    mark.add_argument('--reason', required=True)
    delete = commands.add_parser('delete')
    delete.add_argument('id')
    export = commands.add_parser('export')
    export.add_argument('id', help='Clip ID or all')
    export.add_argument('--output', required=True, help='New ZIP file; existing files are never overwritten')
    commands.add_parser('sessions')
    session = commands.add_parser('session')
    session.add_argument('--thread', default=os.environ.get('CODEX_THREAD_ID', ''))
    session.add_argument('--progress', action='store_true')
    imp = commands.add_parser('import', help='Import explicit messages from a reviewed session JSON snapshot')
    imp.add_argument('--snapshot', required=True, help='JSON returned by session')
    imp.add_argument('--message', action='append', required=True, help='Selected message ID; repeat to select multiple')
    imp.add_argument('--title')
    imp.add_argument('--note')
    imp.add_argument('--topic-id')
    commands.add_parser('topics')
    topic = commands.add_parser('topic-create')
    topic.add_argument('--title', required=True)
    topic.add_argument('--goal', default='')
    args = parser.parse_args()
    base = args.url.rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise Failure('Use a loopback HTTP URL. For remote services, configure an SSH tunnel first.', 2)
    if args.timeout <= 0:
        raise Failure('--timeout must be positive', 2)
    def request(route, method='GET', body=None, binary=False):
        req = urllib.request.Request(base + route, method=method,
            data=json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None,
            headers={'Content-Type': 'application/json', 'X-Rewind-Request': '1'})
        # Local traffic must never go through runtime proxy settings or redirects.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *unused):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        try:
            with opener.open(req, timeout=args.timeout) as response:
                raw = response.read()
                return raw if binary else json.loads(raw)
        except urllib.error.HTTPError as err:
            try:
                message = json.loads(err.read()).get('error', str(err))
            except (ValueError, AttributeError):
                message = str(err)
            raise Failure(message, err.code) from err
    def ident(value):
        if not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', value):
            raise Failure('A valid explicit UUID is required; the latest session is never guessed.', 2)
        return value
    def payload():
        data = {}
        for attr, key in [('title','title'), ('body','body'), ('note','note'), ('question','question'), ('source','source'), ('source_url','sourceURL'), ('topic_id','topicID'), ('version','version')]:
            value = getattr(args, attr, None)
            if value is not None:
                data[key] = value
        if getattr(args, 'file', None) is not None:
            data['body'] = sys.stdin.read() if args.file == '-' else Path(args.file).read_text(encoding='utf-8')
        return data
    cmd = args.command
    if cmd == 'panel':
        result = {'threadID': ident(args.thread), 'url': base + '/?' + urllib.parse.urlencode({'thread': args.thread, 'view': 'import', 'panel': '1'})}
    elif cmd == 'health':
        result = request('/health')
        if result.get('app') != 'rewind-web':
            raise Failure('Endpoint is not Threadline')
    elif cmd in ('list', 'topics', 'get'):
        result = request('/api/library?' + urllib.parse.urlencode({'q': getattr(args, 'query', '')}))
        if cmd == 'topics':
            result = {'topics': result['topics']}
        elif cmd == 'get':
            clip = next((c for c in result['clips'] if c['id'] == ident(args.id)), None)
            if not clip:
                raise Failure('Clip not found', 404)
            result = {'clip': clip}
    elif cmd == 'mark':
        result = request('/api/clips/' + ident(args.id) + '/review', 'POST', {'version': args.version, 'status': args.status, 'reason': args.reason})
    elif cmd == 'save':
        result = request('/api/clips', 'POST', payload())
    elif cmd in ('update', 'delete'):
        result = request('/api/clips/' + ident(args.id), 'PUT' if cmd == 'update' else 'DELETE', payload() if cmd == 'update' else None)
    elif cmd == 'export':
        clip_id = 'all' if args.id == 'all' else ident(args.id)
        raw = request('/api/export/' + clip_id, binary=True)
        with open(args.output, 'xb') as output:
            output.write(raw)
        result = {'path': str(Path(args.output).resolve()), 'bytes': len(raw)}
    elif cmd == 'sessions':
        result = request('/api/codex/recent')
    elif cmd == 'session':
        result = request('/api/codex/sessions/' + ident(args.thread) + ('?progress=1' if args.progress else ''))
    elif cmd == 'import':
        snapshot = json.loads(Path(args.snapshot).read_text(encoding='utf-8'))['session']
        selected = [m for m in snapshot['messages'] if m['id'] in args.message]
        if len(set(args.message)) != len(args.message) or len(selected) != len(args.message):
            raise Failure('Select unique message IDs present in the snapshot', 2)
        data = payload()
        data.update(threadID=ident(snapshot['id']), messageIDs=args.message,
                    fingerprints={m['id']: m['fingerprint'] for m in selected}, includeProgress=True)
        result = request('/api/codex/import', 'POST', data)
    elif cmd == 'topic-create':
        result = request('/api/threads', 'POST', {'title': args.title, 'goal': args.goal})
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (Failure, OSError, ValueError, KeyError, TypeError) as err:
        status = getattr(err, 'status', 1)
        print(json.dumps({'error': str(err), 'status': status}, ensure_ascii=False), file=sys.stderr)
        sys.exit(2 if status == 2 else 1)
