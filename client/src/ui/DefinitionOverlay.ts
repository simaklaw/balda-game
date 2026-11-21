import { Container, Graphics, Text } from 'pixi.js';
import type { Application } from 'pixi.js';
import type { MoveHistoryEntry } from '@balda/shared';
import { lookupWord } from '../dict/definitions';
import { Button } from './Button';
import { safeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

/** Толкование слова из Викисловаря (REST, с кэшем) в модальной панели поверх parent. */
export function showDefinitionOverlay(app: Application, parent: Container, word: string): void {
  const insets = safeInsets();
  const width = app.screen.width;
  const height = app.screen.height;
  const overlay = new Container();
  overlay.eventMode = 'static';
  overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.85 }));
  const panelWidth = Math.min(360, width - 40);
  const panelX = Math.floor((width - panelWidth) / 2);
  const panelY = Math.max(48 + insets.top, Math.floor((height - 240) / 2));
  const panel = new Graphics();
  overlay.addChild(panel);
  const title = new Text({
    text: word.toUpperCase(),
    style: { fontFamily: FONT_FAMILY, fontSize: 24, fill: palette().text },
  });
  title.anchor.set(0.5);
  title.position.set(width / 2, panelY + 40);
  overlay.addChild(title);
  const body = new Text({
    text: '',
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: 15,
      fill: palette().text,
      wordWrap: true,
      wordWrapWidth: panelWidth - 40,
      lineHeight: 21,
    },
  });
  body.anchor.set(0.5, 0);
  body.position.set(width / 2, panelY + 72);
  overlay.addChild(body);
  const source = new Text({
    text: 'Источник: Викисловарь (CC BY-SA)',
    style: { fontFamily: FONT_FAMILY, fontSize: 11, fill: palette().textDim },
  });
  source.anchor.set(0.5);
  overlay.addChild(source);
  const btnClose = new Button({
    caption: 'Закрыть',
    sfx: 'back',
    width: panelWidth - 30,
    height: 44,
    color: palette().panel,
    onTap: () => {
      parent.removeChild(overlay);
      overlay.destroy({ children: true });
    },
  });
  overlay.addChild(btnClose);
  parent.addChild(overlay);

  const maxPanelHeight = height - insets.top - 96;
  const render = (text: string): void => {
    if (body.destroyed) return;
    body.text = text;
    const need = Math.min(Math.max(240, 72 + Math.ceil(body.height) + 76), maxPanelHeight);
    panel.clear();
    panel
      .roundRect(panelX, panelY, panelWidth, need, 16)
      .fill({ color: palette().panel })
      .stroke({ width: 2, color: palette().panelBorder });
    source.position.set(width / 2, panelY + need - 70);
    btnClose.position.set(panelX + 15, panelY + need - 52);
  };
  render('Ищем в Викисловаре…');
  void lookupWord(word).then((definition) => {
    if (body.destroyed) return;
    if (definition === null) {
      render('Определение не найдено.\nВозможно, слова нет в Викисловаре или нет подключения к сети.');
      return;
    }
    render(definition.definitions.map((item, index) => index + 1 + '. ' + item).join('\n'));
  });
}

/**
 * Список сыгранных слов (последние ходы); нажатие на слово открывает его толкование.
 * names — подписи игроков по индексу. onClose вызывается после закрытия панели.
 */
export function showWordsOverlay(
  app: Application,
  parent: Container,
  history: readonly MoveHistoryEntry[],
  names: readonly [string, string],
  onClose: () => void,
): void {
  const insets = safeInsets();
  const width = app.screen.width;
  const height = app.screen.height;
  const lineHeight = 22;
  const maxVisible = Math.max(4, Math.floor((height - 280) / lineHeight));
  const visible = history.slice(-maxVisible);
  const overlay = new Container();
  overlay.eventMode = 'static';
  overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
  const panelWidth = Math.min(340, width - 40);
  const panelHeight = Math.min(height - 80, 120 + visible.length * lineHeight + 64);
  const panelX = Math.floor((width - panelWidth) / 2);
  const panelY = Math.max(48 + insets.top, Math.floor((height - panelHeight) / 2));
  overlay.addChild(
    new Graphics()
      .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
      .fill({ color: palette().panel })
      .stroke({ width: 2, color: palette().panelBorder }),
  );
  const title = new Text({
    text: 'Слова партии',
    style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().text },
  });
  title.anchor.set(0.5);
  title.position.set(width / 2, panelY + 32);
  overlay.addChild(title);
  const firstIndex = history.length - visible.length;
  visible.forEach((entry, i) => {
    const line = new Text({
      text: firstIndex + i + 1 + '. ' + names[entry.player === 0 ? 0 : 1] + ': ' + entry.word.toUpperCase() + ' (+' + entry.points + ')',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().text, lineHeight },
    });
    line.anchor.set(0.5, 0);
    line.position.set(width / 2, panelY + 60 + i * lineHeight);
    line.eventMode = 'static';
    line.cursor = 'pointer';
    line.on('pointertap', () => showDefinitionOverlay(app, parent, entry.word));
    overlay.addChild(line);
  });
  const hint = new Text({
    text: visible.length === 0 ? 'Ходов ещё не было' : 'Нажмите на слово, чтобы увидеть толкование',
    style: { fontFamily: FONT_FAMILY, fontSize: 12, fill: palette().textDim },
  });
  hint.anchor.set(0.5);
  hint.position.set(width / 2, panelY + panelHeight - 78);
  overlay.addChild(hint);
  const btnClose = new Button({
    caption: 'Закрыть',
    sfx: 'back',
    width: panelWidth - 30,
    height: 46,
    color: palette().panel,
    onTap: () => {
      parent.removeChild(overlay);
      overlay.destroy({ children: true });
      onClose();
    },
  });
  btnClose.position.set(panelX + 15, panelY + panelHeight - 60);
  overlay.addChild(btnClose);
  parent.addChild(overlay);
}
