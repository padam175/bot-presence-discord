const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Liste des commandes slash du bot, partagée entre index.js (auto-déploiement
// au démarrage) et deploy-commands.js (déploiement manuel, utile en local).
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
    .addBooleanOption(opt =>
      opt.setName('forcer')
        .setDescription('Republier même si une demande existe déjà pour cette date')
        .setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('presence-config')
    .setDescription('Voir ou modifier le lieu, le CP et l\'heure d\'envoi automatique')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('lieu')
        .setDescription('Nouveau lieu par défaut (ex: villa)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('cp')
        .setDescription('Nouveau code postal par défaut (laisse vide pour le retirer)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('heure')
        .setDescription('Nouvelle heure d\'envoi automatique, format HH:MM (ex: 21:00)')
        .setRequired(false))
    .toJSON(),
];

module.exports = commands;
