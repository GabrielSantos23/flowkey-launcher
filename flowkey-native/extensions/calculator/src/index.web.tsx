// Web bundle entry (`app.web.js`): the calculator panel renders as a React
// app inside the shell's WebView2 surface, driven live by the launcher's
// search text (props.query).
import { css } from './web/styles';
import { CalculatorWebApp } from './web/app';
import { mountWebCommand } from '@flowkey-cli/native-sdk/web';

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

mountWebCommand(CalculatorWebApp);
