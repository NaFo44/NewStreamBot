// better-yt-discord-bot.js
// Un bot Discord basique pour gérer des tâches (création, liste, complétion) via slash commands.

import fs from 'fs';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const TASKS_FILE = './tasks.json';

// Charge ou initialise le fichier de tâches
function loadTasks() {
  if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, '[]');
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
}

// Sauvegarde la liste des tâches
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
              .setDescription("ID de la tâche à clôturer")
              .setRequired(true)))
].map(cmd => cmd.toJSON());

// Enregistrement des commandes auprès de Discord
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Mise à jour des commandes slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Commandes enregistrées.');
  } catch (error) {
    console.error("Erreur lors de l'enregistrement :", error);
  }
})();

// Initialisation du client Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { options } = interaction;
  let tasks = loadTasks();

  switch (options.getSubcommand()) {
    case 'create': {
      const title = options.getString('title');
      const id = tasks.length ? tasks[tasks.length - 1].id + 1 : 1;
      tasks.push({ id, title, status: 'todo', createdBy: interaction.user.tag, createdAt: new Date().toISOString() });
      saveTasks(tasks);
      await interaction.reply(`✅ Tâche créée : #${id} - ${title}`);
      break;
    }
    case 'list': {
      if (!tasks.length) return interaction.reply('📂 Aucune tâche en cours.');
      const list = tasks.map(t => `#${t.id} [${t.status}] ${t.title} (par ${t.createdBy})`).join('\n');
      await interaction.reply(`📋 Liste des tâches :\n${list}`);
      break;
    }
    case 'complete': {
      const id = options.getInteger('id');
      const task = tasks.find(t => t.id === id);
      if (!task) return interaction.reply(`❌ Tâche #${id} non trouvée.`);
      task.status = 'done';
      saveTasks(tasks);
      await interaction.reply(`✅ Tâche #${id} marquée comme terminée.`);
      break;
    }
    default:
      await interaction.reply('Commande inconnue.');
  }
});

client.login(process.env.DISCORD_TOKEN);
