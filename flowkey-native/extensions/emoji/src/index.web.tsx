// Web bundle entry (`app.web.js`): the picker renders as a React app inside the
// shell's WebView2 surface. The page owns its React — no @flowkey-cli/react-ui
// here.
import { css } from './web/styles';
import { EmojiWebApp } from './web/app';
import { mountWebCommand } from '@flowkey-cli/native-sdk/web';

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

mountWebCommand(EmojiWebApp);
