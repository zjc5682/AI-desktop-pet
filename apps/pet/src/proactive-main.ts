import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ProactiveApp from './ProactiveApp.vue';

const app = createApp(ProactiveApp);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
