import { db } from '@/lib/db'
import { adminRoute, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_FILE_BYTES = 40 * 1024 * 1024 // 40MB M3U files are realistic

/** M3U file upload → creates an M3U_FILE portal with the raw content stored. */
export const POST = adminRoute(async (request, admin) => {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'FormData parse fail — multipart request bhejo' }, { status: 400 })
  }

  const file = form.get('file')
  const name = (form.get('name') as string | null)?.trim() || 'Uploaded Playlist'

  if (!(file instanceof File)) {
    return Response.json({ error: 'M3U/M3U8 file select karo' }, { status: 400 })
  }
  if (!/\.(m3u8?|txt)$/i.test(file.name)) {
    return Response.json({ error: 'Sirf .m3u / .m3u8 files allowed hain' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: 'File bahut badi hai (max 40MB)' }, { status: 400 })
  }

  const content = await file.text()
  if (!content.includes('#EXTM3U') && !content.includes('#EXTINF')) {
    return Response.json({ error: 'Ye valid M3U playlist nahi lagti (#EXTINF missing)' }, { status: 400 })
  }

  const portal = await db.portal.create({
    data: {
      organizationId: admin.organizationId,
      name,
      type: 'M3U_FILE',
      url: null,
      fileData: content,
      status: 'PENDING',
      notes: `Uploaded: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
    },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PORTAL_UPLOAD_FILE',
    entityType: 'PORTAL',
    entityId: portal.id,
    newValue: { name, fileName: file.name, sizeBytes: file.size },
    request,
  })

  return Response.json(portal, { status: 201 })
})
