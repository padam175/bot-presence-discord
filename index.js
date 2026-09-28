require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

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
  intents: [GatewayIntentBits.Guilds],
});

// Les réactions dans l'ordre exact de la photo
const REACTIONS = [
  { emoji: '🟡', label: '21H' },
  { emoji: '🔵', label: '21H30' },
  { emoji: '🟠', label: '22H' },
  { emoji: '🔴', label: '22H+' },
  { emoji: '❌', label: 'Pas la' },
];

function formatDate(date = new Date()) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Poste le message de demande de présence + ajoute les réactions.
 */
async function postPresenceRequest(channel, { lieu, cp, date } = {}) {
  const finalLieu = lieu || process.env.DEFAULT_LOCATION || 'villa';
  const finalCp = cp || process.env.DEFAULT_CP || '';
  const finalDate = date || formatDate();

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

  return message;
}

client.once('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);

  if (process.env.SCHEDULE_CRON) {
    cron.schedule(
      process.env.SCHEDULE_CRON,
      async () => {
        try {
          const channel = await client.channels.fetch(process.env.CHANNEL_ID);
          await postPresenceRequest(channel);
          console.log(`[${new Date().toISOString()}] Demande de présence envoyée automatiquement.`);
        } catch (err) {
          console.error('Erreur lors de l\'envoi automatique :', err);
        }
      },
      { timezone: process.env.TIMEZONE || 'Europe/Paris' }
    );
    console.log(
      `Envoi automatique programmé : "${process.env.SCHEDULE_CRON}" (${process.env.TIMEZONE || 'Europe/Paris'})`
    );
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'presence') return;

  const lieu = interaction.options.getString('lieu');
  const cp = interaction.options.getString('cp');
  const date = interaction.options.getString('date');

  try {
    await postPresenceRequest(interaction.channel, { lieu, cp, date });
    await interaction.reply({ content: 'Demande de présence envoyée ✅', ephemeral: true });
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Erreur lors de l\'envoi ❌', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
