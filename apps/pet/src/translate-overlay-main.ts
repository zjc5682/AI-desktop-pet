import { createApp } from 'vue';
import { createPinia } from 'pinia';
import TranslationOverlayApp from './TranslationOverlayApp.vue';

const app = createApp(TranslationOverlayApp);
app.use(createPinia());
app.mount('#app');
