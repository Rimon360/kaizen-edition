import { protocol } from 'electron'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

/**
 * Custom `media://` scheme so the sandboxed renderer (contextIsolation + CSP)
 * can load arbitrary local files (clip previews, thumbnails, generated WAVs).
 * The absolute path is base64url-encoded into the URL to avoid escaping issues.
 *
 * The handler streams the file with an explicit Content-Type and HTTP range
 * support — without the correct MIME the <audio>/<video> element fails with
 * "no supported source", and without ranges video seeking + large files break.
 */

export const MEDIA_SCHEME = 'media'

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

function mimeFor(p: string): string {
  return MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

/** Must run BEFORE app `ready`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      // `standard: true` makes it a proper URL scheme so <audio>/<video> can load
      // it consistently from any page origin (file:// AND http://localhost in dev).
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
    },
  ])
}

/** Must run AFTER app `ready`. */
export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      const b64 = url.pathname.replace(/^\//, '') || url.host
      const filePath = Buffer.from(decodeURIComponent(b64), 'base64url').toString('utf8')
      if (!existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      const size = statSync(filePath).size
      const mime = mimeFor(filePath)
      const range = request.headers.get('Range')

      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range)
        const start = m ? parseInt(m[1], 10) : 0
        const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
        const stream = createReadStream(filePath, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
          },
        })
      }

      const stream = createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
        },
      })
    } catch (err) {
      return new Response(`Bad media url: ${err instanceof Error ? err.message : err}`, {
        status: 400,
      })
    }
  })
}
