/** Nest-Scramble | Developed by Mohamed Mustafa | MIT License **/
import { Controller, Get, Inject, Res, SetMetadata } from '@nestjs/common';
import { NestScrambleOptions } from '../NestScrambleModule';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller()
@Public()
export class DocsController {
  constructor(
    @Inject('NEST_SCRAMBLE_OPENAPI') private openApiSpec: any,
    @Inject('NEST_SCRAMBLE_OPTIONS') private options: NestScrambleOptions,
  ) {}

  @Get('docs')
  getDocs(@Res() res: any) {
    const isFuturistic = this.options.theme === 'futuristic';
    const primaryColor = this.options.primaryColor || '#00f2ff';
    const customIcon = this.options.customDomainIcon || '';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>${this.options.apiTitle || 'API Documentation'} - Nest-Scramble</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  ${customIcon ? `<link rel="icon" href="${customIcon}" type="image/x-icon">` : ''}
  <style>
    ${isFuturistic ? this.getFuturisticCSS(primaryColor) : this.getClassicCSS(primaryColor)}
  </style>
</head>
<body>
  <script id="api-reference" data-url="/docs-json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    ${this.getEasterEggScript()}
  </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  private getFuturisticCSS(primaryColor: string): string {
    return `
    /* 🚀 Futuristic Theme by Mohamed Mustafa - Deep Space Edition */
    :root {
      --primary-cyber: ${primaryColor};
      --primary-glow: ${primaryColor}80;
      --purple-electric: #a855f7;
      --deep-space: #050505;
      --space-dark: #0a0a0a;
      --space-card: #111111;
      --space-border: #1a1a1a;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --glow-shadow: 0 0 20px ${primaryColor}40, 0 0 40px ${primaryColor}20;
    }

    * {
      font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
    }

    body {
      margin: 0;
      padding: 0;
      background: var(--deep-space) !important;
      color: var(--text-primary) !important;
      overflow-x: hidden;
    }

    /* Animated Background Grid */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        linear-gradient(var(--space-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--space-border) 1px, transparent 1px);
      background-size: 50px 50px;
      opacity: 0.3;
      z-index: 0;
      pointer-events: none;
      animation: gridPulse 10s ease-in-out infinite;
    }

    @keyframes gridPulse {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 0.4; }
    }

    /* Glassmorphism Cards */
    .scalar-card,
    [class*="card"],
    [class*="panel"],
    [class*="sidebar"] {
      background: rgba(17, 17, 17, 0.6) !important;
      backdrop-filter: blur(20px) !important;
      -webkit-backdrop-filter: blur(20px) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 16px !important;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
    }

    /* Cyber Buttons & Active States */
    button,
    [role="button"],
    .button,
    a[class*="button"] {
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric)) !important;
      border: none !important;
      border-radius: 12px !important;
      padding: 10px 20px !important;
      color: white !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      position: relative !important;
      overflow: hidden !important;
    }

    button:hover,
    [role="button"]:hover,
    .button:hover {
      transform: translateY(-2px) !important;
      box-shadow: var(--glow-shadow) !important;
    }

    button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      transition: left 0.5s;
    }

    button:hover::before {
      left: 100%;
    }

    /* Search Bar - Spotlight Style */
    input[type="search"],
    input[type="text"],
    [class*="search"] input {
      background: rgba(17, 17, 17, 0.8) !important;
      border: 2px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 12px !important;
      padding: 12px 20px !important;
      color: var(--text-primary) !important;
      font-size: 14px !important;
      transition: all 0.3s ease !important;
    }

    input[type="search"]:focus,
    input[type="text"]:focus,
    [class*="search"] input:focus {
      border-color: var(--primary-cyber) !important;
      box-shadow: 0 0 0 3px var(--primary-glow) !important;
      outline: none !important;
    }

    /* Code Blocks - Night Owl Theme */
    pre,
    code,
    [class*="code"],
    .hljs {
      background: #011627 !important;
      border: 1px solid rgba(0, 242, 255, 0.2) !important;
      border-radius: 12px !important;
      padding: 16px !important;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace !important;
      font-size: 13px !important;
      line-height: 1.6 !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
    }

    code {
      color: #82AAFF !important;
    }

    /* Sidebar Glassmorphism */
    [class*="sidebar"],
    nav,
    aside {
      background: rgba(10, 10, 10, 0.7) !important;
      backdrop-filter: blur(30px) !important;
      border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
    }

    /* Custom Branding Badge */
    body::after {
      content: '✨ Powered by Nest-Scramble';
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric));
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      box-shadow: var(--glow-shadow);
      z-index: 9999;
      animation: badgePulse 3s ease-in-out infinite;
      cursor: pointer;
    }

    @keyframes badgePulse {
      0%, 100% { 
        box-shadow: 0 0 20px ${primaryColor}40, 0 0 40px ${primaryColor}20;
      }
      50% { 
        box-shadow: 0 0 30px ${primaryColor}60, 0 0 60px ${primaryColor}30;
      }
    }

    /* Scrollbar Styling */
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: var(--space-dark);
    }

    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, var(--primary-cyber), var(--purple-electric));
      border-radius: 10px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--primary-cyber);
    }

    /* Headers with Gradient */
    h1, h2, h3, h4, h5, h6 {
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 700 !important;
    }

    /* Links */
    a {
      color: var(--primary-cyber) !important;
      text-decoration: none !important;
      transition: all 0.3s ease !important;
    }

    a:hover {
      color: var(--purple-electric) !important;
      text-shadow: 0 0 10px var(--primary-glow) !important;
    }

    /* Method Badges */
    [class*="method"],
    [class*="badge"] {
      border-radius: 8px !important;
      padding: 4px 12px !important;
      font-weight: 600 !important;
      font-size: 11px !important;
      letter-spacing: 0.5px !important;
    }

    /* Response Status Colors */
    [class*="status-200"],
    [class*="success"] {
      background: linear-gradient(135deg, #10b981, #059669) !important;
      color: white !important;
    }

    [class*="status-400"],
    [class*="error"] {
      background: linear-gradient(135deg, #ef4444, #dc2626) !important;
      color: white !important;
    }

    /* Smooth Transitions */
    * {
      transition: background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease !important;
    }

    /* Theme Toggle Button */
    .theme-toggle {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(17, 17, 17, 0.8) !important;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 8px 16px;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      z-index: 9998;
      transition: all 0.3s ease;
    }

    .theme-toggle:hover {
      border-color: var(--primary-cyber);
      box-shadow: 0 0 15px var(--primary-glow);
    }
    `;
  }

  private getClassicCSS(primaryColor: string): string {
    return `
    /* Classic Theme */
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      color: #1a1a1a;
    }

    button,
    [role="button"] {
      background: ${primaryColor} !important;
      color: white !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 10px 20px !important;
      font-weight: 600 !important;
      transition: all 0.3s ease !important;
    }

    button:hover {
      opacity: 0.9 !important;
      transform: translateY(-1px) !important;
    }

    input[type="search"],
    input[type="text"] {
      border: 2px solid #e5e5e5 !important;
      border-radius: 8px !important;
      padding: 10px 16px !important;
      transition: all 0.3s ease !important;
    }

    input:focus {
      border-color: ${primaryColor} !important;
      outline: none !important;
    }

    a {
      color: ${primaryColor} !important;
    }
    `;
  }

  private getEasterEggScript(): string {
    return `
    // Easter Egg Console Message
    console.log('%c✨ Engineered with passion by Mohamed Mustafa', 'color: #00f2ff; font-size: 16px; font-weight: bold; text-shadow: 0 0 10px #00f2ff;');
    console.log('%cNest-Scramble is active.', 'color: #a855f7; font-size: 14px; font-weight: 600;');
    console.log('%c🚀 GitHub: https://github.com/Eng-MMustafa/nest-scramble', 'color: #ffffff; font-size: 12px;');
    
    // Theme Toggle Functionality
    const themeToggle = document.createElement('div');
    themeToggle.className = 'theme-toggle';
    themeToggle.textContent = '🎨 Theme';
    themeToggle.onclick = () => {
      const currentTheme = localStorage.getItem('nest-scramble-theme') || 'futuristic';
      const newTheme = currentTheme === 'futuristic' ? 'classic' : 'futuristic';
      localStorage.setItem('nest-scramble-theme', newTheme);
      window.location.reload();
    };
    document.body.appendChild(themeToggle);
    `;
  }

  @Get('docs-json')
  getOpenApiJson(@Res() res: any) {
    try {
      const jsonString = JSON.stringify(this.openApiSpec, null, 2);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(jsonString);
    } catch (error) {
      console.error('[Nest-Scramble] Error serializing OpenAPI spec:', error);
      res.status(500).json({ error: 'Failed to generate OpenAPI specification' });
    }
  }

  @Get('docs/json')
  getOpenApiJsonLegacy(@Res() res: any) {
    return this.getOpenApiJson(res);
  }

  @Get('docs/spec')
  getOpenApiSpec() {
    return this.openApiSpec;
  }
}