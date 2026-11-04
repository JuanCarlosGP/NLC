#!/usr/bin/env python3
"""Disposable loopback WebDAV/media/download fixture. Never connects to the internet."""
import argparse
import html
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def prepare(root):
    root.mkdir(parents=True, exist_ok=True)
    audio = root / '.fixture.mp3'
    video = root / '.fixture.mp4'
    if not audio.exists():
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i',
                        'sine=frequency=220:sample_rate=44100', '-t', '30', '-af', 'volume=0.08',
                        '-c:a', 'libmp3lame', '-q:a', '6', str(audio)], check=True)
    if not video.exists():
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i',
                        'sine=frequency=330:sample_rate=44100', '-t', '40', '-af', 'volume=0.03',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-movflags', '+faststart', str(video)], check=True)
    albums = {
        'Atlas Chamber/Night Atlas': ['Meridian', 'Low Ceiling', 'Glass Index', 'Blue Hour'],
        'Atlas Chamber/Second Room': ['After Hours', 'Spare Chair', 'Sunrise'],
        'Linen Radio/Warm Static': ['Paper Hum', 'Copper Wire', 'Late Signal', 'Slow Sunday'],
        'Podcasts/Ciencia al dia': ['El cielo nocturno', 'Viaje al fondo del mar', 'La memoria'],
        'Podcasts/Ideas en calma': ['Aprender a escuchar', 'Pequenas rutinas'],
    }
    for folder, titles in albums.items():
        target = root / 'Music' / folder
        target.mkdir(parents=True, exist_ok=True)
        for i, title in enumerate(titles, 1):
            dest = target / f'{i:02} - {title}.mp3'
            if not dest.exists(): shutil.copyfile(audio, dest)
    for rel in [
        'Video/series/Orbitas/Temporada 1/0001 - Amanecer.mp4',
        'Video/series/Orbitas/Temporada 1/0002 - La senal.mp4',
        'Video/series/Cuaderno de viajes/Temporada 1/0001 - La costa.mp4',
        'Video/movies/Un paseo por el mar.mp4',
    ]:
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists(): shutil.copyfile(video, target)
    (root / 'State').mkdir(exist_ok=True)


def serve(root, port):
    jobs = {}

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,PROPFIND,PUT,DELETE,MKCOL,MOVE,POST')
            self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
            super().end_headers()

        def target(self, value=None):
            raw = urllib.parse.urlsplit(value or self.path).path
            path = (root / urllib.parse.unquote(raw).lstrip('/')).resolve()
            if not path.is_relative_to(root): raise ValueError('Outside fixture root')
            return path

        def reply(self, body, status=200, content_type='application/json'):
            data = json.dumps(body).encode() if not isinstance(body, bytes) else body
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            if self.command != 'HEAD': self.wfile.write(data)

        def do_OPTIONS(self):
            self.reply(b'', 204)

        def do_PROPFIND(self):
            target = self.target()
            if not target.exists(): return self.reply({'error': 'missing'}, 404)
            items = [target]
            if target.is_dir() and self.headers.get('Depth') != '0':
                items += sorted(p for p in target.iterdir() if not p.name.startswith('.'))
            rows = []
            for item in items:
                name = '/' + item.relative_to(root).as_posix() + ('/' if item.is_dir() else '')
                href = html.escape(urllib.parse.quote(name))
                kind = '<d:collection/>' if item.is_dir() else ''
                size = 0 if item.is_dir() else item.stat().st_size
                rows.append(f'<d:response><d:href>{href}</d:href><d:propstat><d:prop>'
                            f'<d:displayname>{html.escape(item.name)}</d:displayname>'
                            f'<d:resourcetype>{kind}</d:resourcetype><d:getcontentlength>{size}</d:getcontentlength>'
                            '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>')
            self.reply(('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' + ''.join(rows) + '</d:multistatus>').encode(), 207, 'application/xml')

        def do_PUT(self):
            target = self.target()
            target.parent.mkdir(parents=True, exist_ok=True)
            data = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            target.write_bytes(data)
            self.reply(b'', 201)

        def do_MKCOL(self):
            self.target().mkdir(parents=True, exist_ok=True)
            self.reply(b'', 201)

        def do_DELETE(self):
            target = self.target()
            if target.is_file(): target.unlink()
            elif target.is_dir(): shutil.rmtree(target)
            self.reply(b'', 204)

        def do_MOVE(self):
            target = self.target(self.headers.get('Destination', ''))
            target.parent.mkdir(parents=True, exist_ok=True)
            self.target().rename(target)
            self.reply(b'', 201)

        def do_GET(self):
            path = urllib.parse.urlsplit(self.path).path
            if path == '/health':
                return self.reply({'ok': True, 'ytDlp': 'LOCAL-SIMULATOR', 'podcastDir': '/Music/Podcasts', 'songDir': '/Music/Canciones', 'videoDir': '/Video/movies'})
            if path == '/jobs': return self.reply({'jobs': list(jobs.values())})
            if path.startswith('/jobs/'):
                job = jobs.get(path.split('/')[-1])
                return self.reply(job if job else {'error': 'missing'}, 200 if job else 404)
            target = self.target()
            if target.is_file() and self.headers.get('Range'):
                raw = self.headers['Range'].replace('bytes=', '').split(',')[0]
                left, _, right = raw.partition('-')
                size = target.stat().st_size
                start = int(left or 0)
                end = min(int(right) if right else size - 1, size - 1)
                if start >= size or start > end: return self.reply(b'', 416)
                self.send_response(206)
                self.send_header('Content-Type', mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(end - start + 1))
                self.end_headers()
                with target.open('rb') as file:
                    file.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        data = file.read(min(65536, remaining))
                        if not data: break
                        self.wfile.write(data)
                        remaining -= len(data)
                return
            super().do_GET()

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
            def enqueue(item):
                job_id = f'local-{len(jobs) + 1}'
                title = item.get('title') or item.get('query') or 'Descarga de prueba'
                kind = item.get('kind', 'song')
                job = {'id': job_id, 'status': 'running', 'url': item.get('url', ''), 'kind': kind,
                       'resolvedKind': kind, 'title': title, 'progress': 10, 'filename': None, 'log': ['Simulacion local; no se descarga de internet.']}
                jobs[job_id] = job
                def finish():
                    folder = root / 'Music' / ('Podcasts' if kind == 'podcast' else 'Canciones')
                    folder.mkdir(parents=True, exist_ok=True)
                    dest = folder / f'{job_id} - Descarga de prueba.mp3'
                    shutil.copyfile(root / '.fixture.mp3', dest)
                    job.update(status='done', progress=100, filename=str(dest.relative_to(root)))
                threading.Timer(2, finish).start()
                return {'id': job_id, 'status': 'queued'}
            if self.path == '/download': return self.reply(enqueue(body))
            if self.path == '/download/batch':
                items = [enqueue(item) for item in body.get('items', [])]
                return self.reply({'jobs': items, 'queued': len(items)})
            self.reply({'error': 'not found'}, 404)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'LOCAL DEMO ONLY: http://127.0.0.1:{port}; files: {root}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='/tmp/nlc-demo-media')
    parser.add_argument('--port', type=int, default=8086)
    args = parser.parse_args()
    fixture_root = Path(args.root).resolve()
    if fixture_root == Path('/') or not fixture_root.is_relative_to(Path('/tmp')):
        raise SystemExit('Fixture files must live under /tmp')
    prepare(fixture_root)
    serve(fixture_root, args.port)
