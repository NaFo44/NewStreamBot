// better-yt-discord-bot.js
import fs from 'fs';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TASKS_FILE = './tasks.json';
const STATUS_FILE = './status-message.json';
const STATUS_CHANNEL_ID = process.env.STATUS_CHANNEL_ID; // ID du channel pour le dashboard

// Charge ou initialise un JSON générique
function loadJson(file, defaultValue) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Sauvegarde en JSON
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Charge/sauvegarde des tâches
function loadTasks() {
  return loadJson(TASKS_FILE, []);
}
function saveTasks(tasks) {
  saveJson(TASKS_FILE, tasks);
}

// Client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Met à jour ou crée le message de statut
async function updateStatusMessage() {
  const tasks = loadTasks();
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(console.error);
  if (!channel?.isTextBased()) return console.error('Channel introuvable ou pas un channel textuel.');

  // Contenu formaté
  const lines = tasks.length
    ? tasks.map(t => `#${t.id} [${t.status === 'todo' ? '🔴 TODO' : '✅ DONE'}] ${t.title}`).join('\n')
    : '📂 *Aucune tâche en cours*';
  const content = `**🛠️ Dashboard des tâches Better YT**\n\n${lines}`;

  // Récupère ou crée le message
  const statusData = loadJson(STATUS_FILE, {});
  let message;
  if (statusData.messageId) {
    message = await channel.messages.fetch(statusData.messageId).catch(() => null);
  }

  if (message) {
    // Édite le message existant
    await message.edit(content);
  } else {
    // Envoie un nouveau message
    message = await channel.send(content);
    saveJson(STATUS_FILE, { messageId: message.id });
  }
}

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('task')
    .setDescription('Gère les tâches du projet Better YT')
    .addSubcommand(sub =>
      sub.setName('create')
         .setDescription('Créer une nouvelle tâche')
         .addStringOption(opt =>
           opt.setName('title')
              .setDescription('Titre de la tâche')
              .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
         .setDescription('Liste toutes les tâches'))
    .addSubcommand(sub =>
      sub.setName('complete')
         .setDescription('Marquer une tâche comme terminée')
         .addIntegerOption(opt =>
           opt.setName('id')
              .setDescription("ID de la tâche à clôturer")
              .setRequired(true)))
].map(cmd => cmd.toJSON());

// Enregistrement des commandes
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Mise à jour des commandes slash…');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Commandes enregistrées.');
  } catch (error) {
    console.error("Erreur lors de l'enregistrement :", error);
  }
})();

// Au démarrage
client.once('ready', async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  // Première mise à jour
  await updateStatusMessage();
  // Puis toutes les minutes
  setInterval(updateStatusMessage, 60 * 1000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { options } = interaction;
  let tasks = loadTasks();
  let modified = false;

  switch (options.getSubcommand()) {
    case 'create': {
      const title = options.getString('title');
      const id = tasks.length ? tasks[tasks.length - 1].id + 1 : 1;
      tasks.push({
        id,
        title,
        status: 'todo',
        createdBy: interaction.user.tag,
        createdAt: new Date().toISOString()
      });
      modified = true;
      await interaction.reply(`✅ Tâche créée : #${id} – ${title}`);
      break;
    }
    case 'list': {
      if (!tasks.length) {
        return interaction.reply('📂 Aucune tâche en cours.');
      }
      const list = tasks
        .map(t => `#${t.id} [${t.status}] ${t.title} (par ${t.createdBy})`)
        .join('\n');
      await interaction.reply(`📋 Liste des tâches :\n${list}`);
      break;
    }
    case 'complete': {
      const id = options.getInteger('id');
      const task = tasks.find(t => t.id === id);
      if (!task) {
        return interaction.reply(`❌ Tâche #${id} non trouvée.`);
      }
      task.status = 'done';
      modified = true;
      await interaction.reply(`✅ Tâche #${id} marquée comme terminée.`);
      break;
    }
    default:
      await interaction.reply('Commande inconnue.');
  }

  // Si on a modifié les tâches, on sauve et on met à jour le message de statut
  if (modified) {
    saveTasks(tasks);
    updateStatusMessage().catch(console.error);
  }
});

client.login(process.env.DISCORD_TOKEN);
