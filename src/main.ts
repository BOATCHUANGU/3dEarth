import './styles.css';
import { App } from './app/App';

const app = new App(document.querySelector<HTMLDivElement>('#app')!);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
