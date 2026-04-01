import { createApp } from 'vue';
import { createPinia } from 'pinia';
import SettingsApp from './SettingsApp.vue';

const app = createApp(SettingsApp);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
