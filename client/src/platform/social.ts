/**
 * Чистые функции для игры с друзьями: разбор комнаты из параметров запуска
 * и сборка ссылки-приглашения. Покрыты тестами, не зависят от платформы.
 */

/** Допустимый код комнаты сервера: 3–8 символов (буквы/цифры). */
const ROOM_RE = /^[A-Za-zА-Яа-яЁё0-9]{3,8}$/u;

/**
 * Достаёт код комнаты из ссылки запуска. Поддерживаются:
 * - хэш `#room=КОД` или `#roomКОД`;
 * - параметр `?room=КОД`;
 * - `vk_request_key=roomКОД` (VK передаёт requestKey приглашения).
 */
export function parseLaunchRoom(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, 'https://localhost/');
  } catch {
    return null;
  }
  const candidates: string[] = [];
  const hash = decodeURIComponent(url.hash.replace(/^#/, ''));
  if (hash !== '') {
    const fromHash = /^room[=:]?(.+)$/iu.exec(hash);
    if (fromHash?.[1] !== undefined) candidates.push(fromHash[1]);
  }
  const q = url.searchParams.get('room');
  if (q !== null) candidates.push(q);
  const key = url.searchParams.get('vk_request_key');
  if (key !== null) {
    const fromKey = /^room[=:]?(.+)$/iu.exec(key);
    if (fromKey?.[1] !== undefined) candidates.push(fromKey[1]);
  }
  for (const raw of candidates) {
    const code = raw.trim();
    if (ROOM_RE.test(code)) return code.toUpperCase();
  }
  return null;
}

/**
 * Ссылка-приглашение. В VK Mini Apps ссылка вида https://vk.com/app<ID>#room=КОД
 * открывает приложение с хэшем; ID берётся из vk_app_id запуска. Для остальных
 * площадок — текущий адрес со сменой хэша.
 */
export function buildInviteLink(href: string, roomId: string): string {
  const code = roomId.trim().toUpperCase();
  try {
    const url = new URL(href);
    const appId = url.searchParams.get('vk_app_id');
    if (appId !== null && /^\d+$/.test(appId)) {
      return 'https://vk.com/app' + appId + '#room=' + encodeURIComponent(code);
    }
    url.hash = 'room=' + encodeURIComponent(code);
    return url.toString();
  } catch {
    return href.split('#')[0]! + '#room=' + encodeURIComponent(code);
  }
}
