// Configuración de Metro (el empaquetador de Expo).
// Único cambio: @supabase/realtime-js se reemplaza por un sustituto vacío
// (lib/stubs/realtime.js) porque Kaderno no usa tiempo real y así la app pesa
// menos al abrir. Para volver a usarlo, borra el bloque resolveRequest.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const realtimeStub = path.resolve(__dirname, 'lib/stubs/realtime.js');
const previous = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@supabase/realtime-js') return { type: 'sourceFile', filePath: realtimeStub };
  return (previous ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
