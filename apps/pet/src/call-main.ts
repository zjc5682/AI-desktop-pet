import { createApp } from 'vue';
import { createPinia } from 'pinia';
import VideoCallApp from './VideoCallApp.vue';

const app = createApp(VideoCallApp);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');
