export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("capture") === "mobile") {
    const destination = new URL("/content-studio/video/avatar/captura", url.origin);
    return Response.redirect(destination.toString(), 302);
  }
  return context.next();
}
