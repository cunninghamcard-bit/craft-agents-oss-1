/**
 * Opens a URL in the default browser.
 *
 * ALWAYS use this instead of importing 'open' directly.
 *
 * @param url - The URL to open in the default browser
 */
export async function openUrl(url: string): Promise<void> {
  const open = await import('open');
  const openFn = open.default || open;
  await openFn(url);
}
