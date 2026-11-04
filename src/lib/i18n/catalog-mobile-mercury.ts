export const mobileMercuryEs = { mobileMercury: {
  configure: "Configurar Mercury", changeToken: "Cambiar token", token: "Token Read Only", saveToken: "Guardar y sincronizar",
  tokenHelp: "Crea un token Read Only en Mercury. Se guarda en el almacenamiento seguro del teléfono.", tokenInstructions: "Cómo obtener el token",
  notConfigured: "Sin configurar", configured: "Token guardado", accessExpired: "Revisa el acceso a Mercury",
  automatic: "Actualización automática en primer plano · 15 min", retryAt: "Próximo intento a las {time}",
  disconnect: "Desconectar Mercury", disconnectTitle: "¿Desconectar Mercury?", disconnectBody: "Se elimina el token de este teléfono y se detiene la sincronización. La copia guardada se conserva.",
  accountChangedTitle: "Otra cuenta de Mercury", accountChangedBody: "La conexión contiene otra organización: {accounts}. Sustituir cambia la copia guardada en este teléfono.",
  clearBody: "Se borra esta copia del teléfono. No modifica tu cuenta de Mercury.", clearConnectedBody: "Se borra la copia del teléfono. La sincronización automática volverá a descargarla mientras Mercury siga conectado.",
  errors: {
    network: "Sin conexión a Mercury. La copia guardada se conserva.", auth: "El token ha caducado o no tiene permisos. Configura un token Read Only.",
    rateLimit: "Mercury ha limitado las peticiones. La app esperará antes de reintentar.", upstream: "Mercury no responde. La copia anterior se conserva.",
    invalid: "Mercury devolvió datos no válidos. La copia anterior se conserva.", size: "Los datos superan el límite de la copia. La copia anterior se conserva.",
    pagination: "No se pudo completar el historial. La copia anterior se conserva.", currency: "Moneda no admitida. La copia anterior se conserva.",
    storage: "No se pudo acceder al token o guardar la copia. Reintenta o vuelve a configurar Mercury.", configure: "Configura Mercury con un token Read Only.",
    token: "Pega solo el token de Mercury, sin espacios ni cabeceras.", accountChanged: "La conexión corresponde a otra cuenta. Revisa el cambio antes de sustituir la copia.",
  },
} } as const;
export const mobileMercuryEn = { mobileMercury: {
  configure: "Set up Mercury", changeToken: "Change token", token: "Read Only token", saveToken: "Save and sync",
  tokenHelp: "Create a Read Only token in Mercury. It is saved in your phone’s secure storage.", tokenInstructions: "How to get a token",
  notConfigured: "Not configured", configured: "Token saved", accessExpired: "Check Mercury access",
  automatic: "Automatic foreground updates · 15 min", retryAt: "Next attempt at {time}",
  disconnect: "Disconnect Mercury", disconnectTitle: "Disconnect Mercury?", disconnectBody: "Removes the token from this phone and stops syncing. Your saved copy is kept.",
  accountChangedTitle: "Different Mercury account", accountChangedBody: "This connection contains another organization: {accounts}. Replacing changes the copy saved on this phone.",
  clearBody: "Deletes this copy from your phone. Your Mercury account is unchanged.", clearConnectedBody: "Deletes the phone’s copy. Automatic sync will download it again while Mercury remains connected.",
  errors: {
    network: "Cannot reach Mercury. Your saved copy is kept.", auth: "The token expired or lacks permissions. Set up a Read Only token.",
    rateLimit: "Mercury limited requests. The app will wait before retrying.", upstream: "Mercury is unavailable. Your previous copy is kept.",
    invalid: "Mercury returned invalid data. Your previous copy is kept.", size: "The data exceeds the copy limit. Your previous copy is kept.",
    pagination: "Could not finish the history. Your previous copy is kept.", currency: "Unsupported currency. Your previous copy is kept.",
    storage: "Could not access the token or save the copy. Retry or set up Mercury again.", configure: "Set up Mercury with a Read Only token.",
    token: "Paste only the Mercury token, without spaces or headers.", accountChanged: "This connection belongs to another account. Review it before replacing your copy.",
  },
} } as const;
