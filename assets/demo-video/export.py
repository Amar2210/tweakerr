"""Encode the 18.8s comments-only film using an existing local FFmpeg.

No packages, installs, narration, or external audio. Frames stay in --work.
The original 15s soundtrack is retained byte-for-byte; the film edit inserts
8 beats (3.75s) of that instrumental before its original closing phrase.
"""
from pathlib import Path
from array import array
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parent
FPS, FRAMES, DURATION = 30, 564, 18.8
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--work', type=Path, help='Unique Temp directory printed by render.mjs')
parser.add_argument('--ffmpeg', default=os.environ.get('TWEAKERR_FFMPEG'), help='Existing local FFmpeg executable')
parser.add_argument('--prepare-audio', action='store_true', help='Only create soundtrack-film.wav for browser preview')
args = parser.parse_args()


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def extend_music():
    source = ROOT / 'soundtrack.wav'
    with wave.open(str(source), 'rb') as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (2, 2, 48000, 720000)
        pcm = array('h', w.readframes(w.getnframes()))
    if sys.byteorder != 'little':
        pcm.byteswap()
    at = lambda seconds: round(seconds * 48000) * 2
    # Keep the original beat and pitch, then its complete original fade-out.
    film = pcm[:at(11.25)] + pcm[at(7.5):at(11.25)] + pcm[at(11.25):] + array('h', [0]) * at(.05)
    half = at(.02)
    centre = at(11.25)
    for i in range(2 * half):
        p = i // 2 / (half - 1)
        p = min(1, p); p = p * p * (3 - 2 * p)
        a, b = pcm[at(11.25) - half + i], pcm[at(7.5) - half + i]
        film[centre - half + i] = round(a * (1-p) + b * p)
    assert len(film) == round(DURATION * 48000) * 2
    peak = max(abs(x) for x in film)
    rms = math.sqrt(sum(x*x for x in film) / len(film))
    if sys.byteorder != 'little':
        film.byteswap()
    output = ROOT / 'soundtrack-film.wav'
    with wave.open(str(output), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000); w.writeframes(film.tobytes())
    return {'speech': False, 'source': source.name, 'sourceSha256': sha(source), 'edit': '0–11.25 + 7.5–11.25 + 11.25–15 + 0.05s silence; 40ms time-preserving crossfade at 11.25s', 'seconds': DURATION, 'samplePeakDbfs': 20*math.log10(peak/32768), 'rmsDbfs': 20*math.log10(rms/32768), 'sha256': sha(output)}


music = extend_music()
if args.prepare_audio:
    print(json.dumps(music, indent=2))
    raise SystemExit(0)
if args.work is None:
    parser.error('--work is required when encoding')
work = args.work.resolve()
render = json.loads((work / 'render-validation.json').read_text())
assert (render['frames'], render['renderedFrames'], render['fps'], render['duration']) == (FRAMES, FRAMES, FPS, DURATION)
assert not render['preview'] and not render['errors'] and not render['external']
assert len(list((work / 'frames').glob('*.jpg'))) == FRAMES
if args.ffmpeg:
    ffmpeg = args.ffmpeg
else:
    try:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        parser.error('Pass --ffmpeg with an EXISTING encoder; do not install anything')


def fp(file):
    text = str(file)
    if os.name != 'nt' and str(ffmpeg).lower().endswith('.exe'):
        return subprocess.check_output(['wslpath', '-w', text], text=True).strip()
    return text


def run(parts, capture=False):
    return subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'info' if capture else 'warning', *parts], check=True, capture_output=capture, text=capture)


out = ROOT.parent / 'tweakerr-demo.mp4'
poster = ROOT.parent / 'tweakerr-demo-poster.jpg'
run(['-y', '-framerate', str(FPS), '-i', fp(work/'frames'/'%04d.jpg'), '-i', fp(ROOT/'soundtrack-film.wav'), '-t', str(DURATION), '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-threads', '4', '-metadata', 'title=Tweakerr — Make it yours.', '-metadata', 'comment=Current Tweakerr HTML editing and element comments. Original instrumental and whooshes; no speech.', fp(out)])
# Decode the entire final video and audio, not just the source frames/container.
probe = run(['-i', fp(out), '-af', 'volumedetect', '-f', 'null', '-'], capture=True)
log = probe.stderr
assert 'Video: h264 (High)' in log and 'yuv420p(tv, bt709' in log and '1920x1080' in log and '30 fps' in log and 'Audio: aac (LC)' in log and '48000 Hz, stereo' in log, log
assert re.search(r'Duration: ([\d:.]+)', log).group(1) == '00:00:18.80', log
assert re.search(r'frame=\s*564\b', log), log
run(['-y', '-ss', '13.8', '-i', fp(out), '-frames:v', '1', '-q:v', '2', '-update', '1', fp(poster)])
checkpoints = [.8, 2.9, 5.4, 8.9, 11.4, 13.8, 15.8, 18.2]
select = '+'.join(f'eq(n\\,{round(t*FPS)})' for t in checkpoints)
contact = work / 'decoded-contact-sheet.jpg'
run(['-y', '-i', fp(out), '-vf', f'select={select},scale=480:270,tile=4x2', '-frames:v', '1', '-q:v', '2', '-update', '1', fp(contact)])
video = out.read_bytes()
validation = {'file': out.name, 'durationSeconds': DURATION, 'width': 1920, 'height': 1080, 'fps': FPS, 'frames': FRAMES, 'videoCodec': 'H.264 High / yuv420p, limited-range BT.709', 'audioCodec': 'AAC LC, stereo, 48 kHz, 192 kb/s target', 'bytes': out.stat().st_size, 'sha256': sha(out), 'faststart': video.index(b'moov') < video.index(b'mdat'), 'fullFinalAvDecode': 'PASS', 'audioPeakDbfs': float(re.search(r'max_volume: ([\d.-]+)', log).group(1)), 'audioMeanDbfs': float(re.search(r'mean_volume: ([\d.-]+)', log).group(1)), 'music': music, 'poster': {'file': poster.name, 'seconds': 13.8, 'bytes': poster.stat().st_size, 'sha256': sha(poster)}, 'decodedContactSheetTimes': checkpoints, 'captureBuildSha256': json.loads((ROOT/'capture-validation.json').read_text())['buildSha256'], 'providerCalls': 0, 'externalRequests': 0}
assert validation['faststart'] and validation['audioPeakDbfs'] < 0
(ROOT/'validation.json').write_text(json.dumps(validation, indent=2)+'\n', encoding='utf-8')
(work/'video-validation.json').write_text(json.dumps(validation, indent=2)+'\n', encoding='utf-8')
(work/'decode.log').write_text(log, encoding='utf-8')
print(json.dumps(validation, indent=2))
print('Decoded contact sheet:', contact)
