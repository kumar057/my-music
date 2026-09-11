<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let email = '';
  let password = '';
  let showPassword = false;
  let remember = true;
  let loading = false;
  let error = '';
  let mouseX = 0;
  let mouseY = 0;
  let particles = Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: (index * 17.7) % 100,
    top: (index * 31.3) % 100,
    delay: (index % 7) * -1.4,
    duration: 7 + (index % 5)
  }));

  onMount(() => {
    const saved = window.localStorage.getItem('myMusicLoginEmail');
    if (saved) email = saved;
  });

  function handlePointerMove(event: PointerEvent) {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    mouseX = x * 10;
    mouseY = y * -10;
  }

  async function handleSubmit() {
    error = '';
    if (!email.trim() || !password.trim()) {
      error = 'Enter your email and password to continue.';
      return;
    }

    loading = true;
    await new Promise((resolve) => window.setTimeout(resolve, 650));

    window.localStorage.setItem('myMusicAuth', 'true');
    if (remember) window.localStorage.setItem('myMusicLoginEmail', email.trim());
    else window.localStorage.removeItem('myMusicLoginEmail');

    await goto('/');
  }
</script>

<svelte:head>
  <title>Sign in — My Music</title>
  <meta name="description" content="Sign in to your My Music experience." />
</svelte:head>

<div class="login-scene" onpointermove={handlePointerMove}>
  <div class="aurora aurora-one"></div>
  <div class="aurora aurora-two"></div>
  <div class="grid-plane"></div>

  {#each particles as particle}
    <span
      class="particle"
      style={`left:${particle.left}%;top:${particle.top}%;animation-delay:${particle.delay}s;animation-duration:${particle.duration}s`}
    ></span>
  {/each}

  <div
    class="holo-orbit orbit-one"
    style={`transform: translate3d(${mouseX * 0.7}px, ${mouseY * 0.7}px, 0) rotateX(68deg) rotateZ(-18deg)`}
  ></div>
  <div
    class="holo-orbit orbit-two"
    style={`transform: translate3d(${mouseX * -0.35}px, ${mouseY * -0.35}px, 0) rotateY(72deg) rotateZ(28deg)`}
  ></div>

  <main class="content" style={`--mx:${mouseX}px;--my:${mouseY}px`}>
    <section class="brand-block">
      <div class="logo-cube" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <p class="eyebrow">MY MUSIC · IMMERSIVE AUDIO</p>
      <h1>Enter your<br /><em>sound universe.</em></h1>
      <p class="tagline">Your library. Your playlists. Your world of music.</p>
    </section>

    <section class="login-card" aria-label="Sign in">
      <div class="card-glow"></div>
      <div class="card-topline"><span></span><span></span><span></span></div>

      <div class="card-heading">
        <div>
          <p class="micro">WELCOME BACK</p>
          <h2>Sign in</h2>
        </div>
        <div class="live-dot"><i></i> LIVE</div>
      </div>

      <form onsubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
        <label>
          <span>Email</span>
          <div class="input-shell">
            <span class="input-icon">@</span>
            <input bind:value={email} type="email" autocomplete="email" placeholder="you@example.com" />
          </div>
        </label>

        <label>
          <span>Password</span>
          <div class="input-shell">
            <span class="input-icon">••</span>
            <input bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete="current-password" placeholder="Enter your password" />
            <button class="eye" type="button" onclick={() => (showPassword = !showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </label>

        <div class="form-row">
          <label class="remember">
            <input type="checkbox" bind:checked={remember} />
            <span>Remember me</span>
          </label>
          <button type="button" class="forgot" onclick={() => (error = 'Password recovery will be available when a backend authentication provider is connected.')}>Forgot password?</button>
        </div>

        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        <button class="submit" type="submit" disabled={loading}>
          <span>{loading ? 'ENTERING…' : 'ENTER MY MUSIC'}</span>
          <b>↗</b>
        </button>
      </form>

      <div class="divider"><span>OR</span></div>

      <button class="guest" type="button" onclick={() => goto('/')}>Continue without account <span>→</span></button>
      <p class="legal">By continuing, you agree to use My Music responsibly.</p>
    </section>
  </main>

  <div class="corner-label top-left">MM / 01</div>
  <div class="corner-label bottom-right">AUDIO SYSTEM · ONLINE</div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    min-height: 100%;
    background: #05060b;
    color: #f6f7fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  :global(body) { overflow-x: hidden; }

  .login-scene {
    min-height: 100vh;
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    isolation: isolate;
    background:
      radial-gradient(circle at 50% 45%, rgba(90, 255, 204, .09), transparent 30%),
      radial-gradient(circle at 20% 20%, rgba(120, 84, 255, .13), transparent 28%),
      #05060b;
  }

  .login-scene::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(circle, black 10%, transparent 75%);
    pointer-events: none;
  }

  .aurora, .grid-plane, .holo-orbit, .particle { pointer-events: none; position: absolute; }

  .aurora { width: 44vw; height: 44vw; border-radius: 50%; filter: blur(70px); opacity: .3; animation: breathe 8s ease-in-out infinite; }
  .aurora-one { background: #35f2bc; left: -15vw; top: 5vh; }
  .aurora-two { background: #704cff; right: -15vw; bottom: -10vh; animation-delay: -3s; }

  .grid-plane {
    width: 140vw;
    height: 70vh;
    bottom: -43vh;
    left: -20vw;
    opacity: .18;
    background-image: linear-gradient(rgba(103,255,212,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(103,255,212,.35) 1px, transparent 1px);
    background-size: 70px 70px;
    transform: perspective(480px) rotateX(62deg) translateZ(-30px);
    transform-origin: center top;
    animation: gridMove 9s linear infinite;
  }

  .holo-orbit { width: 310px; height: 310px; border: 1px solid rgba(105,255,218,.28); border-radius: 50%; transform-style: preserve-3d; box-shadow: 0 0 35px rgba(77,255,207,.12), inset 0 0 35px rgba(77,255,207,.05); transition: transform .25s ease-out; }
  .orbit-one { left: 9vw; top: 12vh; animation: orbit 16s linear infinite; }
  .orbit-two { right: 8vw; bottom: 7vh; width: 240px; height: 240px; border-color: rgba(152,123,255,.28); animation: orbitReverse 13s linear infinite; }

  .particle { width: 3px; height: 3px; border-radius: 50%; background: #baffec; box-shadow: 0 0 12px #6fffd1; opacity: .5; animation: floatParticle 8s ease-in-out infinite; }

  .content { width: min(1080px, 92vw); display: grid; grid-template-columns: 1fr 430px; gap: clamp(50px, 8vw, 120px); align-items: center; position: relative; z-index: 2; perspective: 1400px; transform: translate3d(var(--mx), var(--my), 0); transition: transform .25s ease-out; }

  .brand-block { transform: translateZ(50px); }
  .eyebrow, .micro, .corner-label { font-size: 10px; letter-spacing: .22em; font-weight: 700; color: rgba(205,255,240,.58); }
  .eyebrow { margin: 0 0 24px; }
  h1 { font-size: clamp(48px, 6.4vw, 82px); line-height: .9; letter-spacing: -.065em; margin: 0; font-weight: 700; text-shadow: 0 15px 60px rgba(80,255,205,.14); }
  h1 em { color: #d7ff73; font-style: normal; text-shadow: 0 0 35px rgba(215,255,115,.18); }
  .tagline { max-width: 390px; margin-top: 28px; color: rgba(255,255,255,.52); line-height: 1.7; }

  .logo-cube { width: 58px; height: 58px; margin-bottom: 34px; position: relative; transform-style: preserve-3d; transform: rotateX(-18deg) rotateY(28deg); animation: cubeFloat 5s ease-in-out infinite; }
  .logo-cube span { position: absolute; inset: 8px; border: 1px solid rgba(215,255,115,.7); background: rgba(215,255,115,.06); box-shadow: inset 0 0 18px rgba(215,255,115,.08), 0 0 25px rgba(215,255,115,.1); }
  .logo-cube span:nth-child(1) { transform: translateZ(18px); }
  .logo-cube span:nth-child(2) { transform: rotateY(90deg) translateZ(18px); }
  .logo-cube span:nth-child(3) { transform: rotateX(90deg) translateZ(18px); }
  .logo-cube span:nth-child(4) { transform: translateZ(-18px); }

  .login-card { position: relative; overflow: hidden; padding: 34px; border: 1px solid rgba(255,255,255,.13); border-radius: 28px; background: linear-gradient(145deg, rgba(25,29,38,.78), rgba(8,10,16,.68)); backdrop-filter: blur(26px) saturate(135%); box-shadow: 0 40px 100px rgba(0,0,0,.5), inset 0 1px rgba(255,255,255,.08), 0 0 70px rgba(78,255,211,.05); transform: rotateY(calc(var(--mx) * -.15)) rotateX(calc(var(--my) * .15)) translateZ(80px); transform-style: preserve-3d; }
  .card-glow { position: absolute; width: 190px; height: 190px; border-radius: 50%; background: #62ffd4; opacity: .07; filter: blur(55px); right: -70px; top: -80px; }
  .card-topline { display: flex; gap: 6px; margin-bottom: 28px; }
  .card-topline span { width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.25); }
  .card-topline span:first-child { background: #d7ff73; box-shadow: 0 0 10px #d7ff73; }
  .card-heading { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .micro { margin: 0 0 7px; font-size: 8px; }
  h2 { margin: 0; font-size: 31px; letter-spacing: -.04em; }
  .live-dot { font-size: 8px; letter-spacing: .16em; color: rgba(255,255,255,.45); }
  .live-dot i { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #d7ff73; box-shadow: 0 0 10px #d7ff73; animation: pulse 1.7s infinite; }
  form { display: grid; gap: 18px; }
  label > span { display: block; font-size: 11px; color: rgba(255,255,255,.55); margin-bottom: 8px; }
  .input-shell { height: 52px; display: flex; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 13px; background: rgba(255,255,255,.035); transition: .2s ease; }
  .input-shell:focus-within { border-color: rgba(215,255,115,.5); box-shadow: 0 0 0 4px rgba(215,255,115,.05), 0 0 25px rgba(215,255,115,.07); transform: translateY(-1px); }
  input[type='email'], input[type='password'], input[type='text'] { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: white; font: inherit; font-size: 13px; }
  input::placeholder { color: rgba(255,255,255,.24); }
  .input-icon { width: 28px; text-align: center; color: #d7ff73; font-size: 11px; opacity: .8; }
  .eye, .forgot, .guest { border: 0; background: none; color: rgba(255,255,255,.45); cursor: pointer; font: inherit; }
  .eye { font-size: 8px; letter-spacing: .1em; padding: 10px; }
  .form-row { display: flex; justify-content: space-between; align-items: center; margin-top: -2px; }
  .remember { display: flex; gap: 8px; align-items: center; cursor: pointer; }
  .remember span { margin: 0; font-size: 10px; }
  .remember input { accent-color: #d7ff73; }
  .forgot { font-size: 10px; color: #d7ff73; }
  .error { margin: -2px 0 0; font-size: 11px; color: #ffafcc; line-height: 1.5; }
  .submit { height: 54px; border: 1px solid rgba(215,255,115,.35); border-radius: 14px; background: linear-gradient(100deg, #d7ff73, #8fffcf); color: #07100d; font-weight: 800; letter-spacing: .1em; font-size: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 0 17px; box-shadow: 0 14px 35px rgba(130,255,194,.15); transition: transform .2s ease, box-shadow .2s ease; }
  .submit:hover:not(:disabled) { transform: translateY(-2px) translateZ(10px); box-shadow: 0 20px 45px rgba(130,255,194,.24); }
  .submit:disabled { opacity: .65; cursor: wait; }
  .submit b { font-size: 18px; }
  .divider { display: flex; align-items: center; gap: 12px; color: rgba(255,255,255,.2); font-size: 8px; letter-spacing: .2em; margin: 24px 0 17px; }
  .divider::before, .divider::after { content: ''; height: 1px; flex: 1; background: rgba(255,255,255,.08); }
  .guest { width: 100%; color: rgba(255,255,255,.7); font-size: 11px; display: flex; justify-content: space-between; padding: 4px 2px; }
  .guest:hover, .forgot:hover, .eye:hover { color: #d7ff73; }
  .legal { text-align: center; margin: 18px 0 0; font-size: 8px; color: rgba(255,255,255,.24); }
  .corner-label { position: fixed; z-index: 4; opacity: .5; font-size: 8px; }
  .top-left { left: 25px; top: 24px; }
  .bottom-right { right: 25px; bottom: 24px; }

  @keyframes breathe { 0%,100% { transform: scale(.9); opacity: .22; } 50% { transform: scale(1.1); opacity: .34; } }
  @keyframes gridMove { from { background-position: 0 0; } to { background-position: 0 70px; } }
  @keyframes orbit { to { rotate: 360deg; } }
  @keyframes orbitReverse { to { rotate: -360deg; } }
  @keyframes floatParticle { 0%,100% { translate: 0 0; opacity: .2; } 50% { translate: 0 -25px; opacity: .7; } }
  @keyframes cubeFloat { 0%,100% { translate: 0 0; } 50% { translate: 0 -9px; } }
  @keyframes pulse { 50% { opacity: .3; transform: scale(.7); } }

  @media (max-width: 820px) {
    .content { grid-template-columns: 1fr; gap: 34px; padding: 70px 0 50px; }
    .brand-block { text-align: center; }
    .logo-cube { margin-inline: auto; }
    .tagline { margin-inline: auto; }
    .login-card { width: min(430px, calc(100vw - 40px)); box-sizing: border-box; margin-inline: auto; }
    .holo-orbit { opacity: .35; }
  }

  @media (prefers-reduced-motion: reduce) {
    .aurora, .grid-plane, .holo-orbit, .particle, .logo-cube, .live-dot i { animation: none !important; }
    .content, .login-card, .holo-orbit { transition: none !important; transform: none !important; }
  }
</style>
