/* DataLab — example of assets/js/supabase/config.js (public values only).
   Publishable/anon key: OK in the browser (RLS protects the data).
   service_role / secret key: NEVER here — it lives only in Supabase's Edge Function secrets. */
window.DATALAB_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_PUBLISHABLE_KEY',
  autosaveSeconds: 60,
  // Spotify (compact in-game player): the app's PUBLIC Client ID from developer.spotify.com/dashboard.
  // OAuth with PKCE: there is NO client secret in this project; never paste one here. Empty = no player.
  spotifyClientId: 'YOUR_SPOTIFY_CLIENT_ID',
  // optional: only if the Redirect URI registered on Spotify differs from <this site>/spotify-callback.html
  // spotifyRedirectUri: 'https://datalab-six.vercel.app/spotify-callback.html',
};
