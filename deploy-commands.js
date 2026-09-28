require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('presence')
    .setDescription('Envoie une demande de présence maintenant')
    .addStringOption(opt =>
      opt.setName('lieu')
        .setDescription('Lieu du RDV (défaut: valeur configurée)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('cp')
        .setDescription('Code postal (défaut: valeur configurée)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('date')
        .setDescription('Date au format JJ/MM/AAAA (défaut: aujourd\'hui)')
        .setRequired(false))
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Déploiement des commandes slash...');

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(route, { body: commands });

    console.log('Commandes déployées avec succès.');
    if (process.env.GUILD_ID) {
      console.log('(Déploiement sur un seul serveur -> disponible immédiatement)');
    } else {
      console.log('(Déploiement global -> peut prendre jusqu\'à 1h pour apparaître partout)');
    }
  } catch (err) {
    console.error('Erreur lors du déploiement des commandes :', err);
  }
})();
