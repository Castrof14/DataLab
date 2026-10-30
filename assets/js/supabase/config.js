/* DataLab — public Supabase settings for the browser.
   ONLY the project URL and the PUBLISHABLE (anon) key go here: they are public by design and every
   table is protected by Row Level Security. NEVER put the service_role / secret key (sb_secret_…) in
   this file or anywhere the browser loads — cloud.js refuses to start if it sees one.
   Empty values = the game runs offline (local saves, local wallet), exactly as before.
   Fill it from Project Settings → API (or copy config.example.js). */
window.DATALAB_CONFIG = {
  supabaseUrl: 'https://lhqatamrukslqjqgmzqz.supabase.co',            // e.g. 'https://abcd1234.supabase.co'
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocWF0YW1ydWtzbHFqcWdtenF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMDkyNzIsImV4cCI6MjEwNjc4NTI3Mn0.lW4DF8sWNbqhodsM2YqLaL3h4azJzDEdNbunbx4PzMY', // 'sb_publishable_…' or the legacy anon key
  autosaveSeconds: 60,
  // Spotify (compact in-game player): the app's PUBLIC Client ID from developer.spotify.com/dashboard.
  // OAuth with PKCE: there is NO client secret in this project; never paste one here. Empty = no player.
  spotifyClientId: '886bbf5787614301b2efd5d0b5edb384',
  // optional: only if the Redirect URI registered on Spotify differs from <this site>/spotify-callback.html
  // spotifyRedirectUri: 'https://datalab-six.vercel.app/spotify-callback.html',
};
