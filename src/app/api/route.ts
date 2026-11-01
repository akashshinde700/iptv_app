/** No public API index. */
export function GET() {
  return new Response("Not found", { status: 404 })
}
