import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ChatApp from './ChatApp.vue';

const app = createApp(ChatApp);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
