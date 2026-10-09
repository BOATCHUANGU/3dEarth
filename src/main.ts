import './styles.css';
import './android.css';
import { App } from './app/App';
import { prepareNativeWindow, releaseNativeLaunch } from './app/NativeWindow';

async function start() {
  const disposeWindow = await prepareNativeWindow();
  const app = new App(document.querySelector<HTMLDivElement>('#app')!);
  releaseNativeLaunch();
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      app.dispose();
      disposeWindow();
    });
}
void start();
