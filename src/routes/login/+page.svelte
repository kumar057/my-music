<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { signIn, signUp } from '$lib/auth';

  let email = '';
  let password = '';
  let showPassword = false;
  let remember = true;
  let loading = false;
  let mode: 'signin' | 'signup' = 'signin';
  let message = '';
  let error = '';
  let mouseX = 0;
  let mouseY = 0;

  onMount(() => {
    email = window.localStorage.getItem('myMusicLoginEmail') ?? '';
  });

  function move(event: PointerEvent) {
    mouseX = (event.clientX / window.innerWidth - 0.5) * 12;
    mouseY = (event.clientY / window.innerHeight - 0.5) * -12;
  }

  async function submit() {
    error = '';
    message = '';
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      error = 'Enter your email and password.';
      return;
    }
    if (password.length < 6) {
      error = 'Password must be at least 6 characters.';
      return;
    }

    loading = true;
    try {
      if (mode === 'signin') {
        await signIn(cleanEmail, password);
        if (remember) window.localStorage.setItem('myMusicLoginEmail', cleanEmail);
        else window.localStorage.removeItem('myMusicLoginEmail');
        window.localStorage.setItem('myMusicAuth', 'true');
        await goto('/');
      } else {
        const result = await signUp(cleanEmail, password);
        if (result.access_token) {
          window.localStorage.setItem('myMusicAuth', 'true');
          await goto('/');
        } else {
          message = 'Account created. Check your email to confirm, then sign in.';
          mode = 'signin';
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Authentication failed.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>{mode === 'signin' ? 'Sign in' : 'Create account'} — My Music</title>
</svelte:head>

<div class="scene" onpointermove={move}>
  <div class="stars"></div><div class="aurora a"></div><div class="aurora b"></div>
  <div class="ring r1" style={`translate:${mouseX * .7}px ${mouseY * .7}px`}></div>
  <div class="ring r2" style={`translate:${mouseX * -.4}px ${mouseY * -.4}px`}></div>
  <div class="grid"></div>

  <main class="wrap" style={`--mx:${mouseX}px;--my:${mouseY}px`}>
    <section class="hero">
      <div class="cube" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <small>MY MUSIC · IMMERSIVE AUDIO</small>
      <h1>Your sound.<br><em>Your universe.</em></h1>
      <p>One beautiful home for your local library, playlists and music discovery.</p>
    </section>

    <section class="card">
      <div class="top"><span></span><span></span><span></span><b>● SECURE</b></div>
      <small>{mode === 'signin' ? 'WELCOME BACK' : 'NEW LISTENER'}</small>
      <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
      <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label>Email<input bind:value={email} type="email" autocomplete="email" placeholder="you@example.com" /></label>
        <label>Password<div class="password"><input bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Minimum 6 characters" /><button type="button" onclick={() => showPassword = !showPassword}>{showPassword ? 'HIDE' : 'SHOW'}</button></div></label>
        {#if mode === 'signin'}
          <label class="remember"><input type="checkbox" bind:checked={remember} /> Remember me</label>
        {/if}
        {#if error}<p class="error">{error}</p>{/if}
        {#if message}<p class="message">{message}</p>{/if}
        <button class="submit" disabled={loading}>{loading ? 'PLEASE WAIT…' : mode === 'signin' ? 'ENTER MY MUSIC ↗' : 'CREATE MY ACCOUNT ↗'}</button>
      </form>
      <div class="switch">{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'} <button type="button" onclick={() => { mode = mode === 'signin' ? 'signup' : 'signin'; error = ''; message = ''; }}>{mode === 'signin' ? 'Create one' : 'Sign in'}</button></div>
      <button class="guest" type="button" onclick={() => goto('/')}>Continue without account →</button>
      <p class="legal">Authentication is securely handled by your configured Supabase project.</p>
    </section>
  </main>
</div>

<style>
  :global(html,body){margin:0;min-height:100%;background:#04050a;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.scene{min-height:100vh;overflow:hidden;position:relative;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,#123c3540,transparent 35%),#04050a;isolation:isolate}.stars{position:absolute;inset:0;background-image:radial-gradient(#d7ff73 1px,transparent 1px),radial-gradient(#8b7cff 1px,transparent 1px);background-size:90px 90px,140px 140px;opacity:.16;animation:stars 20s linear infinite}.aurora{position:absolute;width:45vw;height:45vw;border-radius:50%;filter:blur(80px);opacity:.2;animation:breathe 8s ease-in-out infinite}.a{background:#35f2bc;left:-15vw;top:0}.b{background:#704cff;right:-15vw;bottom:-10vh;animation-delay:-4s}.grid{position:absolute;width:140vw;height:70vh;bottom:-43vh;background-image:linear-gradient(#66ffd922 1px,transparent 1px),linear-gradient(90deg,#66ffd922 1px,transparent 1px);background-size:65px 65px;transform:perspective(500px) rotateX(62deg);animation:grid 9s linear infinite}.ring{position:absolute;width:330px;height:330px;border:1px solid #7affda33;border-radius:50%;transform-style:preserve-3d;box-shadow:0 0 45px #4fffd41c;animation:orbit 15s linear infinite}.r1{left:7vw;top:12vh;transform:rotateX(68deg) rotateZ(-18deg)}.r2{right:8vw;bottom:7vh;width:230px;height:230px;border-color:#9d82ff44;animation-direction:reverse}.wrap{width:min(1080px,92vw);display:grid;grid-template-columns:1fr 420px;gap:clamp(45px,8vw,110px);align-items:center;position:relative;z-index:2;perspective:1400px;transform:translate3d(var(--mx),var(--my),0);transition:transform .25s}.hero{transform:translateZ(60px)}small{font-size:9px;letter-spacing:.22em;color:#caffed88;font-weight:700}.cube{width:60px;height:60px;position:relative;transform-style:preserve-3d;transform:rotateX(-20deg) rotateY(30deg);animation:cube 5s ease-in-out infinite;margin-bottom:30px}.cube i{position:absolute;inset:7px;border:1px solid #d7ff73aa;background:#d7ff7310;box-shadow:0 0 22px #d7ff7320}.cube i:nth-child(1){transform:translateZ(20px)}.cube i:nth-child(2){transform:rotateY(90deg) translateZ(20px)}.cube i:nth-child(3){transform:rotateX(90deg) translateZ(20px)}.cube i:nth-child(4){transform:translateZ(-20px)}h1{font-size:clamp(52px,6vw,80px);line-height:.9;letter-spacing:-.065em;margin:20px 0;font-weight:750}h1 em{font-style:normal;color:#d7ff73;text-shadow:0 0 35px #d7ff7330}.hero p{max-width:400px;color:#ffffff80;line-height:1.7}.card{padding:34px;border-radius:28px;border:1px solid #ffffff1c;background:linear-gradient(145deg,#191d26cc,#080a10b5);backdrop-filter:blur(28px) saturate(140%);box-shadow:0 40px 100px #0009,0 0 70px #4fffd40d,inset 0 1px #ffffff12;transform:rotateY(calc(var(--mx)*-.12)) rotateX(calc(var(--my)*.12)) translateZ(70px);transition:transform .25s;position:relative}.top{display:flex;gap:6px;margin-bottom:30px}.top span{width:5px;height:5px;border-radius:50%;background:#ffffff35}.top span:first-child{background:#d7ff73;box-shadow:0 0 10px #d7ff73}.top b{margin-left:auto;font-size:8px;letter-spacing:.12em;color:#d7ff7380}h2{font-size:32px;letter-spacing:-.04em;margin:7px 0 27px}form{display:grid;gap:17px}label{font-size:11px;color:#ffffff80}input{box-sizing:border-box;width:100%;height:52px;margin-top:8px;padding:0 15px;border-radius:13px;border:1px solid #ffffff12;outline:none;background:#ffffff08;color:#fff;font:inherit}.password{position:relative}.password input{padding-right:60px}.password button{position:absolute;right:8px;top:15px;border:0;background:none;color:#d7ff73;font-size:8px;letter-spacing:.1em;cursor:pointer}.remember{display:flex;align-items:center;gap:8px}.remember input{width:auto;height:auto;margin:0;accent-color:#d7ff73}.submit{height:54px;border:0;border-radius:14px;background:#d7ff73;color:#07100b;font-weight:800;letter-spacing:.04em;cursor:pointer;box-shadow:0 12px 35px #d7ff7322;transition:.2s}.submit:hover{transform:translateY(-2px);box-shadow:0 16px 45px #d7ff7340}.submit:disabled{opacity:.6;cursor:wait}.error,.message{font-size:11px;margin:0;padding:10px 12px;border-radius:10px}.error{color:#ffabc8;background:#ff5f8710;border:1px solid #ff5f8730}.message{color:#caffed;background:#5dffc410;border:1px solid #5dffc430}.switch{text-align:center;margin:23px 0 14px;font-size:10px;color:#ffffff55}.switch button,.guest{border:0;background:none;color:#d7ff73;cursor:pointer;font:inherit}.guest{display:block;margin:auto;font-size:11px}.legal{text-align:center;color:#ffffff2e;font-size:8px;margin:22px 0 0}.scene:has(input:focus) .card{box-shadow:0 40px 100px #0009,0 0 80px #d7ff7310,inset 0 1px #ffffff12}@keyframes breathe{50%{transform:scale(1.12);opacity:.28}}@keyframes orbit{to{rotate:360deg}}@keyframes grid{to{background-position:0 65px}}@keyframes stars{to{background-position:180px 90px,-140px 140px}}@keyframes cube{50%{transform:rotateX(18deg) rotateY(210deg) translateY(-8px)}}@media(max-width:800px){.wrap{grid-template-columns:1fr;max-width:500px}.hero{text-align:center}.hero p{margin-left:auto;margin-right:auto}.cube{margin-left:auto;margin-right:auto}.hero h1{font-size:52px}.card{transform:none}.ring{opacity:.35}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition:none!important}}
</style>
