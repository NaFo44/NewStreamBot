// better-yt-discord-bot.js
// Bot Discord amélioré pour Better YT : gestion de tâches et notifications GitHub webhook

import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
// ID du salon où poster les notifications GitHub
const WEBHOOK_CHANNEL_ID = process.env.GITHUB_WEBHOOK_CHANNEL_ID;
// Port pour l'écoute du webhook
const PORT = process.env.PORT || 3000;

const TASKS_FILE = './tasks.json';

function loadTasks() {
  if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, '[]');
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

// Définition des commandes slash
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
              .setDescription('ID de la tâche à clôturer')
              .setRequired(true)))
].map(cmd => cmd.toJSON());

// Enregistrement des commandes slash
(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Mise à jour des commandes slash...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Commandes enregistrées.');
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement :', error);
  }
})();

// Client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Gestion des erreurs non gérées
process.on('unhandledRejection', console.error);
client.on('error', console.error);

client.once(Events.ClientReady, () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'task') return;
  await interaction.deferReply();
  try {
    let tasks = loadTasks();
    switch (interaction.options.getSubcommand()) {
      case 'create': {
        const title = interaction.options.getString('title');
        const id = tasks.length ? tasks[tasks.length - 1].id + 1 : 1;
        tasks.push({ id, title, status: 'todo', createdBy: interaction.user.tag, createdAt: new Date().toISOString() });
        saveTasks(tasks);
        await interaction.editReply(`✅ Tâche créée : #${id} - ${title}`);
        break;
      }
      case 'list': {
        if (!tasks.length) {
          await interaction.editReply('📂 Aucune tâche en cours.');
        } else {
          const list = tasks.map(t => `#${t.id} [${t.status}] ${t.title} (par ${t.createdBy})`).join('\n');
          await interaction.editReply(`📋 Liste des tâches :\n${list}`);
        }
        break;
      }
      case 'complete': {
        const id = interaction.options.getInteger('id');
        const task = tasks.find(t => t.id === id);
        if (!task) {
          await interaction.editReply(`❌ Tâche #${id} non trouvée.`);
        } else {
          task.status = 'done';
          saveTasks(tasks);
          await interaction.editReply(`✅ Tâche #${id} marquée comme terminée.`);
        }
        break;
      }
      default:
        await interaction.editReply('Commande inconnue.');
    }
  } catch (error) {
    console.error('Erreur dans l\'interaction :', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp('Une erreur est survenue en traitant la commande.');
    } else {
      await interaction.reply('Une erreur est survenue.');
    }
  }
});

// Serveur Express pour GitHub Webhook
const app = express();
app.use(bodyParser.json());

app.post('/github-webhook', (req, res) => {
  const event = req.headers['x-github-event'];
  if (event === 'push') {
    const { ref, commits, repository } = req.body;
    const commit = commits[commits.length - 1];
    const message = `Nouvelle modification sur \`${repository.full_name}\` (${ref}):\n${commit.message}\n${commit.url}`;
    const channel = client.channels.cache.get(WEBHOOK_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      channel.send(message).catch(console.error);
    } else {
      console.error('Salon webhook introuvable ou non textuel');
    }
  }
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Webhook GitHub écoute sur le port ${PORT}`);
});

// Connexion du bot
client.login(TOKEN);
