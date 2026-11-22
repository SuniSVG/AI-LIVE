"""Máy chủ giọng đọc VieNeu cục bộ cho Draw Live (chỉ giọng, không có giao diện web).

Chạy: python tts/tts_server.py --port 47831 --voice "Hải Đăng"
Đường ONNX/CPU: không cần torch/gradio. Lần đầu sẽ tải mô hình vào HF_HOME (app đặt sẵn).
API: POST /speak  body JSON {"text": "..."}  ->  file WAV.  GET /health -> ok.
Chỉ lắng nghe trên 127.0.0.1.
"""
import argparse
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vieneu import Vieneu

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=47831)
ap.add_argument('--voice', default='Hải Đăng')
args = ap.parse_args()

tts = Vieneu(backend='onnx')  # ép đường ONNX/CPU để không kéo theo torch
lock = threading.Lock()       # mô hình xử lý từng yêu cầu một
print('VieNeu sẵn sàng', flush=True)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, b'ok')
        self._send(404)

    def do_POST(self):
        if self.path != '/speak':
            return self._send(404)
        try:
            n = int(self.headers.get('Content-Length', 0))
            text = str(json.loads(self.rfile.read(n) or b'{}').get('text', '')).strip()[:160]
        except Exception:
            return self._send(400)
        if not text:
            return self._send(400)
        try:
            with lock:
                audio = tts.infer(text, voice=args.voice)
                with tempfile.TemporaryDirectory() as d:
                    out = os.path.join(d, 'out.wav')
                    tts.save(audio, out)
                    with open(out, 'rb') as f:
                        data = f.read()
        except Exception as e:  # lỗi tổng hợp: trả 500 để app bỏ qua câu này
            print('VieNeu error:', e, flush=True)
            return self._send(500)
        self._send(200, data, 'audio/wav')

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
