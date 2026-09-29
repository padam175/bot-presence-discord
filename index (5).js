require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, Partials } = require('discord.js');
const cron = require('node-cron');
const commands = require('./commands');

// Mini serveur HTTP : Render (plan gratuit) exige qu'un "Web Service" réponde
// sur un port, sinon il considère le service en échec. Ça n'a aucun rapport
// avec Discord, c'est juste pour satisfaire Render.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Presence bot en ligne.');
  })
  .listen(PORT, () => console.log(`Serveur HTTP (pour Render) à l'écoute sur le port ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  // Les partials permettent de recevoir les événements de réaction même sur
  // des messages/canaux non mis en cache (le bot n'a pas l'intent de contenu).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// Les réactions dans l'ordre exact de la photo
const REACTIONS = [
  { emoji: '🟡', label: '21H' },
  { emoji: '🔵', label: '21H30' },
  { emoji: '🟠', label: '22H' },
  { emoji: '🔴', label: '22H+' },
  { emoji: '❌', label: 'Pas la' },
];

// ---- Fichier d'état (dernière date déjà publiée, anti-doublon) ----
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('Impossible de sauvegarder state.json :', err);
  }
}

// ---- Fichier de config (lieu, CP, heure d'envoi automatique) ----
// Modifiable directement depuis Discord via /presence-config, sans toucher au code.
// Note : comme state.json, ce fichier est remis à zéro à chaque nouveau déploiement
// sur Render (nouveau push GitHub) et repart alors sur les valeurs du .env.
const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    saved = {};
  }
  return {
    lieu: saved.lieu || process.env.DEFAULT_LOCATION || 'villa',
    cp: saved.cp !== undefined ? saved.cp : (process.env.DEFAULT_CP || ''),
    scheduleCron: saved.scheduleCron || process.env.SCHEDULE_CRON || '0 18 * * *',
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config));
  } catch (err) {
    console.error('Impossible de sauvegarder config.json :', err);
  }
}

function formatDate(date = new Date()) {
  const tz = process.env.TIMEZONE || 'Europe/Paris';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Poste le message de demande de présence + ajoute les réactions.
 * Renvoie { skipped: true } si une demande a déjà été publiée pour cette date
 * (sauf si force = true), sinon { skipped: false, message }.
 */
async function postPresenceRequest(channel, { lieu, cp, date, force } = {}) {
  const config = loadConfig();
  const finalLieu = lieu || config.lieu;
  const finalCp = cp !== undefined && cp !== null ? cp : config.cp;
  const finalDate = date || formatDate();

  const state = loadState();
  if (!force && state.lastDate === finalDate) {
    return { skipped: true, date: finalDate };
  }

  const rdvLine = finalCp
    ? `📍 ${finalLieu} · CP ${finalCp}`
    : `📍 ${finalLieu}`;

  const legendLine1 = REACTIONS.slice(0, 3).map(r => `${r.emoji} ${r.label}`).join(' · ');
  const legendLine2 = REACTIONS.slice(3).map(r => `${r.emoji} ${r.label}`).join(' · ');

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`🗓️ Présence du ${finalDate}`)
    .setDescription(`${rdvLine}\n\n${legendLine1}\n${legendLine2}`);

  const content = process.env.ROLE_ID ? `<@&${process.env.ROLE_ID}>` : undefined;

  const message = await channel.send({ content, embeds: [embed] });

  for (const r of REACTIONS) {
    await message.react(r.emoji);
  }

  saveState({ ...state, lastDate: finalDate });

  return { skipped: false, message, date: finalDate };
}

// ---- Gestion du cron (reprogrammable à chaud via /presence-config) ----
let cronTask = null;

function scheduleCronJob(cronExpr) {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  if (!cronExpr) return;

  cronTask = cron.schedule(
    cronExpr,
    async () => {
      try {
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        const result = await postPresenceRequest(channel);
        if (result.skipped) {
          console.log(`[${new Date().toISOString()}] Envoi automatique ignoré : déjà publié pour ${result.date}.`);
        } else {
          console.log(`[${new Date().toISOString()}] Demande de présence envoyée automatiquement.`);
        }
      } catch (err) {
        console.error('Erreur lors de l\'envoi automatique :', err);
      }
    },
    { timezone: process.env.TIMEZONE || 'Europe/Paris' }
  );
  console.log(`Envoi automatique programmé : "${cronExpr}" (${process.env.TIMEZONE || 'Europe/Paris'})`);
}

client.once('ready', async () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  // Enregistre/met à jour automatiquement les commandes slash à chaque démarrage.
  // Nécessaire car le plan gratuit de Render ne donne pas accès au Shell pour
  // lancer "npm run deploy-commands" manuellement.
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log('Commandes slash enregistrées auprès de Discord.');
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement des commandes slash :', err);
  }

  const config = loadConfig();
  scheduleCronJob(config.scheduleCron);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // ---- /presence : publier une demande maintenant ----
  if (interaction.commandName === 'presence') {
    const lieu = interaction.options.getString('lieu');
    const cp = interaction.options.getString('cp');
    const date = interaction.options.getString('date');
    const force = interaction.options.getBoolean('forcer') || false;

    try {
      const channel = interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));
      const result = await postPresenceRequest(channel, { lieu, cp, date, force });

      if (result.skipped) {
        await interaction.reply({
          content: `⚠️ Une demande de présence a déjà été publiée pour le ${result.date}. Utilise l'option "forcer" si tu veux la republier quand même.`,
          flags: 64,
        });
      } else {
        await interaction.reply({ content: 'Demande de présence envoyée ✅', flags: 64 });
      }
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: 'Erreur lors de l\'envoi ❌', flags: 64 });
    }
    return;
  }

  // ---- /presence-config : modifier lieu / CP / heure d'envoi automatique ----
  if (interaction.commandName === 'presence-config') {
    const lieu = interaction.options.getString('lieu');
    const cp = interaction.options.getString('cp');
    const heure = interaction.options.getString('heure');

    const config = loadConfig();

    if (!lieu && cp === null && !heure) {
      // Aucune option fournie : afficher la config actuelle
      await interaction.reply({
        content:
          `**Config actuelle**\n` +
          `📍 Lieu : ${config.lieu}\n` +
          `🏷️ CP : ${config.cp || '(non défini)'}\n` +
          `⏰ Cron d'envoi automatique : \`${config.scheduleCron}\` (${process.env.TIMEZONE || 'Europe/Paris'})`,
        flags: 64,
      });
      return;
    }

    if (heure) {
      const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(heure.trim());
      if (!match) {
        await interaction.reply({
          content: '❌ Format d\'heure invalide. Utilise HH:MM, ex : 21:00',
          flags: 64,
        });
        return;
      }
      const [, hh, mm] = match;
      config.scheduleCron = `${Number(mm)} ${Number(hh)} * * *`;
    }

    if (lieu) config.lieu = lieu;
    if (cp !== null) config.cp = cp; // permet de vider le CP avec une chaîne vide

    saveConfig(config);
    scheduleCronJob(config.scheduleCron);

    await interaction.reply({
      content:
        `✅ Config mise à jour :\n` +
        `📍 Lieu : ${config.lieu}\n` +
        `🏷️ CP : ${config.cp || '(non défini)'}\n` +
        `⏰ Envoi automatique : \`${config.scheduleCron}\` (${process.env.TIMEZONE || 'Europe/Paris'})`,
      flags: 64,
    });
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);

// Dès qu'une vraie personne (pas le bot) ajoute une réaction sur un message,
// on retire la réaction "placeholder" du bot sur cet emoji précis, pour que
// le nombre affiché ne compte plus que les vrais votes.
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const isOurReaction = REACTIONS.some(r => r.emoji === reaction.emoji.name);
    if (!isOurReaction) return;
    if (reaction.message.author?.id !== client.user.id) return;

    const botReacted = reaction.users.cache.has(client.user.id) || (await reaction.users.fetch()).has(client.user.id);
    if (botReacted) {
      await reaction.users.remove(client.user.id);
    }
  } catch (err) {
    console.error('Erreur lors du retrait de la réaction du bot :', err);
  }
});
