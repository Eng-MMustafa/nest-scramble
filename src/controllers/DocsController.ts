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
  <div id="api-reference"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    // Professional Dashboard Configuration - Single Request Per Page
    const configuration = {
      spec: {
        url: '/docs-json'
      },
      layout: 'modern',
      theme: 'none',
      darkMode: true,
      showSidebar: true,
      hideModels: false,
      hideDownloadButton: false,
      defaultOpenAllTags: true,
      searchHotKey: 'k',
      servers: [
        {
          url: '${this.options.baseUrl || 'http://localhost:3000'}',
          description: 'Development Server'
        }
      ]
    };
    
    // Initialize Scalar with error handling
    const apiReference = document.getElementById('api-reference');
    if (apiReference) {
      // Wait for Scalar to load
      const initScalar = () => {
        if (window.ScalarApiReference) {
          try {
            window.ScalarApiReference.mount(apiReference, configuration);
            console.log('%c✅ Nest-Scramble Dashboard Loaded', 'color: #00f2ff; font-weight: bold;');
          } catch (error) {
            console.error('Scalar initialization error:', error);
          }
        } else {
          setTimeout(initScalar, 100);
        }
      };
      initScalar();
    }
    
    ${this.getEasterEggScript()}
  </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  private getFuturisticCSS(primaryColor: string): string {
    return `
    /* 🚀 Professional API Dashboard by Mohamed Mustafa - Stripe/Postman Inspired */
    :root {
      --primary-cyber: ${primaryColor};
      --primary-glow: ${primaryColor}60;
      --primary-soft: ${primaryColor}15;
      --purple-electric: #8B5CF6;
      
      /* Deep Black Background */
      --deep-black: #000000;
      --deep-charcoal: #0B0E14;
      --sidebar-dark: #13161C;
      --content-dark: #0B0E14;
      --card-bg: #1A1D24;
      --border-subtle: #2A2D35;
      
      /* Text Colors - High Contrast */
      --text-primary: #FFFFFF;
      --text-secondary: #D1D5DB;
      --text-muted: #9CA3AF;
      
      /* HTTP Method Colors */
      --get-blue: #3B82F6;
      --post-green: #10B981;
      --put-orange: #F59E0B;
      --patch-purple: #8B5CF6;
      --delete-red: #EF4444;
      
      /* Danger & Info */
      --danger-red: #F85149;
      --info-blue: #58A6FF;
      
      /* Glow Effects */
      --glow-shadow: 0 0 30px var(--primary-glow), 0 8px 24px rgba(0, 242, 255, 0.3);
    }

    /* ============================================
       GLOBAL RESET & TYPOGRAPHY
    ============================================ */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    }

    html,
    body {
      background: var(--deep-charcoal) !important;
      color: var(--text-primary) !important;
      overflow-x: hidden;
      line-height: 1.6;
      height: 100%;
    }

    /* Force single-request per page layout */
    .scalar-api-reference,
    [class*="api-reference"] {
      display: flex !important;
      flex-direction: row !important;
      height: 100vh !important;
      overflow: hidden !important;
    }

    /* Hide all-in-one scroll view */
    [class*="scroll-view"],
    [class*="all-endpoints-view"],
    [class*="endpoint-list-container"] {
      display: none !important;
    }

    /* ============================================
       SIDEBAR ARCHITECTURE (Single-Request Navigation)
    ============================================ */
    
    /* Sidebar Container */
    .sidebar,
    [class*="sidebar"],
    nav[class*="navigation"],
    nav[class*="nav"],
    aside {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 320px !important;
      height: 100vh !important;
      background: var(--sidebar-dark) !important;
      border-right: 1px solid var(--border-subtle) !important;
      overflow-y: auto !important;
      z-index: 1000 !important;
      padding: 0 !important;
      backdrop-filter: none !important;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3) !important;
    }

    /* Mohamed Mustafa Dashboard Logo */
    .sidebar::before,
    [class*="sidebar"]::before {
      content: '👨‍💻 Mohamed Mustafa Dashboard';
      display: block;
      padding: 32px 24px;
      font-size: 18px;
      font-weight: 800;
      color: var(--text-primary);
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      border-bottom: 1px solid var(--border-subtle);
      letter-spacing: -0.5px;
    }

    /* Sidebar Scrollbar */
    .sidebar::-webkit-scrollbar,
    [class*="sidebar"]::-webkit-scrollbar {
      width: 6px;
    }

    .sidebar::-webkit-scrollbar-track,
    [class*="sidebar"]::-webkit-scrollbar-track {
      background: transparent;
    }

    .sidebar::-webkit-scrollbar-thumb,
    [class*="sidebar"]::-webkit-scrollbar-thumb {
      background: var(--border-subtle);
      border-radius: 3px;
    }

    .sidebar::-webkit-scrollbar-thumb:hover,
    [class*="sidebar"]::-webkit-scrollbar-thumb:hover {
      background: var(--text-muted);
    }

    /* Controller Group Headers (with elegant dividers) */
    .sidebar h2,
    .sidebar h3,
    [class*="sidebar"] h2,
    [class*="sidebar"] h3,
    [class*="group-title"],
    [class*="section-title"],
    [class*="tag-title"] {
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 1.5px !important;
      color: var(--text-muted) !important;
      padding: 24px 24px 12px 24px !important;
      margin: 0 !important;
      background: transparent !important;
      border-top: 1px solid var(--border-subtle) !important;
      margin-top: 16px !important;
    }

    .sidebar h2:first-of-type,
    [class*="sidebar"] h2:first-of-type {
      border-top: none !important;
      margin-top: 0 !important;
    }

    /* Sidebar Navigation Items (Standalone Routes) */
    .sidebar a,
    .sidebar button,
    [class*="sidebar"] a,
    [class*="sidebar"] button,
    [class*="nav-item"],
    [class*="endpoint-item"],
    [class*="operation-item"] {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 14px 24px !important;
      margin: 4px 16px !important;
      border-radius: 10px !important;
      color: var(--text-secondary) !important;
      text-decoration: none !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
      border: none !important;
      background: transparent !important;
      position: relative !important;
      border-left: 3px solid transparent !important;
      cursor: pointer !important;
    }

    /* Sidebar Item Hover */
    .sidebar a:hover,
    .sidebar button:hover,
    [class*="sidebar"] a:hover,
    [class*="sidebar"] button:hover,
    [class*="nav-item"]:hover,
    [class*="endpoint-item"]:hover {
      background: rgba(255, 255, 255, 0.05) !important;
      color: var(--text-primary) !important;
      transform: translateX(2px) !important;
    }

    /* Active/Selected Sidebar Item (Current Route) */
    .sidebar a.active,
    .sidebar button.active,
    [class*="sidebar"] a.active,
    [class*="sidebar"] button.active,
    [class*="nav-item"].active,
    [class*="endpoint-item"].active,
    [class*="operation-item"].active,
    [class*="selected"],
    [aria-selected="true"],
    [aria-current="page"] {
      background: var(--primary-soft) !important;
      color: var(--primary-cyber) !important;
      border-left-color: var(--primary-cyber) !important;
      font-weight: 700 !important;
      box-shadow: 
        0 0 20px var(--primary-glow),
        inset 0 0 0 1px rgba(0, 242, 255, 0.2) !important;
    }

    /* ============================================
       SINGLE-FOCUS PAGE LAYOUT
    ============================================ */
    
    /* Main Content Area (Single Endpoint View) */
    main,
    [class*="content"],
    [class*="main"],
    [class*="endpoint-view"] {
      margin-left: 320px !important;
      min-height: 100vh !important;
      background: var(--content-dark) !important;
      padding: 48px 64px !important;
      overflow-y: auto !important;
    }

    /* Endpoint Container */
    [class*="endpoint"],
    [class*="operation"],
    article {
      max-width: 1400px !important;
      margin: 0 auto !important;
      background: transparent !important;
    }

    /* ============================================
       METHOD BADGES (Large & Vibrant)
    ============================================    /* GLOW BADGES (HTTP Methods) */
    
    [class*="method"],
    [class*="badge"],
    [class*="http-method"],
    [data-method] {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 10px 24px !important;
      border-radius: 12px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
      border: none !important;
      min-width: 90px !important;
      position: relative !important;
      overflow: hidden !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    /* GET - Royal Blue */
    [class*="method-get"],
    [class*="badge-get"],
    [data-method="get"],
    [data-method="GET"],
    .http-method-get {
      background: var(--get-blue) !important;
      color: #ffffff !important;
      box-shadow: 
        0 0 20px rgba(59, 130, 246, 0.5),
        0 4px 16px rgba(59, 130, 246, 0.4) !important;
    }

    [class*="method-get"]:hover,
    [data-method="get"]:hover {
      box-shadow: 
        0 0 30px rgba(59, 130, 246, 0.6),
        0 6px 20px rgba(59, 130, 246, 0.5) !important;
      transform: translateY(-2px) !important;
    }

    /* POST - Emerald Green */
    [class*="method-post"],
    [class*="badge-post"],
    [data-method="post"],
    [data-method="POST"],
    .http-method-post {
      background: var(--post-green) !important;
      color: #ffffff !important;
      box-shadow: 
        0 0 20px rgba(16, 185, 129, 0.5),
        0 4px 16px rgba(16, 185, 129, 0.4) !important;
    }

    [class*="method-post"]:hover,
    [data-method="post"]:hover {
      box-shadow: 
        0 0 30px rgba(16, 185, 129, 0.6),
        0 6px 20px rgba(16, 185, 129, 0.5) !important;
      transform: translateY(-2px) !important;
    }

    /* PUT - Amber Orange */
    [class*="method-put"],
    [class*="badge-put"],
    [data-method="put"],
    [data-method="PUT"],
    .http-method-put {
      background: var(--put-orange) !important;
      color: #ffffff !important;
      box-shadow: 
        0 0 20px rgba(245, 158, 11, 0.5),
        0 4px 16px rgba(245, 158, 11, 0.4) !important;
    }

    [class*="method-put"]:hover,
    [data-method="put"]:hover {
      box-shadow: 
        0 0 30px rgba(245, 158, 11, 0.6),
        0 6px 20px rgba(245, 158, 11, 0.5) !important;
      transform: translateY(-2px) !important;
    }

    /* PATCH - Violet Purple */
    [class*="method-patch"],
    [class*="badge-patch"],
    [data-method="patch"],
    [data-method="PATCH"],
    .http-method-patch {
      background: var(--patch-purple) !important;
      color: #ffffff !important;
      box-shadow: 
        0 0 20px rgba(139, 92, 246, 0.5),
        0 4px 16px rgba(139, 92, 246, 0.4) !important;
    }

    [class*="method-patch"]:hover,
    [data-method="patch"]:hover {
      box-shadow: 
        0 0 30px rgba(139, 92, 246, 0.6),
        0 6px 20px rgba(139, 92, 246, 0.5) !important;
      transform: translateY(-2px) !important;
    }

    /* DELETE - Vibrant Red */
    [class*="method-delete"],
    [class*="badge-delete"],
    [data-method="delete"],
    [data-method="DELETE"],
    .http-method-delete {
      background: var(--delete-red) !important;
      color: #ffffff !important;
      box-shadow: 
        0 0 20px rgba(239, 68, 68, 0.5),
        0 4px 16px rgba(239, 68, 68, 0.4) !important;
    }

    [class*="method-delete"]:hover,
    [data-method="delete"]:hover {
      box-shadow: 
        0 0 30px rgba(239, 68, 68, 0.6),
        0 6px 20px rgba(239, 68, 68, 0.5) !important;
      transform: translateY(-2px) !important;
    }

    /* ============================================
       INFORMATION HIERARCHY
    ============================================ */
    
    /* Endpoint Title (Big & Bold) */
    h1,
    [class*="title"],
    [class*="heading"],
    [class*="operation-title"] {
      font-size: 32px !important;
      font-weight: 800 !important;
      color: var(--text-primary) !important;
      margin: 24px 0 16px 0 !important;
      line-height: 1.2 !important;
      letter-spacing: -0.5px !important;
      font-family: 'Plus Jakarta Sans', sans-serif !important;
    }

    /* Description */
    p,
    [class*="description"] {
      font-size: 16px !important;
      color: var(--text-secondary) !important;
      margin: 16px 0 !important;
      line-height: 1.7 !important;
    }

    /* Path Display */
    [class*="path"],
    [class*="url"],
    code {
      background: var(--card-bg) !important;
      border: 1px solid var(--border-subtle) !important;
      border-radius: 8px !important;
      padding: 12px 16px !important;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace !important;
      font-size: 14px !important;
      color: var(--primary-cyber) !important;
      display: inline-block !important;
      margin: 8px 0 !important;
    }

    /* ============================================
       THREE-COLUMN POWER-USER PANELS
    ============================================ */
    
    /* THREE-COLUMN MASTERPIECE LAYOUT */
    [class*="panels"],
    [class*="columns"],
    [class*="grid"],
    [class*="endpoint-body"] {
      display: grid !important;
      grid-template-columns: 1fr 1fr 1fr !important;
      gap: 32px !important;
      margin: 48px 0 !important;
      align-items: start !important;
    }

    /* Panel A (Left) - Documentation */
    [class*="panel-docs"],
    [class*="documentation"],
    [class*="parameters"] {
      background: var(--card-bg) !important;
      border: 1px solid var(--border-subtle) !important;
      border-radius: 12px !important;
      padding: 32px !important;
    }

    /* Panel B (Middle) - Request Body Editor with Glassmorphism */
    [class*="panel-request"],
    [class*="request-body"],
    [class*="request-editor"],
    [class*="editor"] {
      background: rgba(26, 29, 36, 0.7) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 16px !important;
      padding: 32px !important;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
    }

    /* Panel C (Right) - Test Request with Enhanced Glassmorphism */
    [class*="panel-test"],
    [class*="test-request"],
    [class*="try-it"],
    [class*="playground"] {
      background: rgba(26, 29, 36, 0.6) !important;
      backdrop-filter: blur(24px) !important;
      -webkit-backdrop-filter: blur(24px) !important;
      border: 1px solid rgba(0, 242, 255, 0.3) !important;
      border-radius: 16px !important;
      padding: 32px !important;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 40px rgba(0, 242, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
      position: relative !important;
    }

    /* Copy Code Button */
    [class*="copy-button"],
    button[class*="copy"] {
      position: absolute !important;
      top: 16px !important;
      right: 16px !important;
      padding: 8px 16px !important;
      background: rgba(255, 255, 255, 0.1) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      border-radius: 8px !important;
      color: var(--text-primary) !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
    }

    [class*="copy-button"]:hover,
    button[class*="copy"]:hover {
      background: rgba(255, 255, 255, 0.15) !important;
      border-color: var(--primary-cyber) !important;
      box-shadow: 0 0 12px var(--primary-glow) !important;
    }

    /* ============================================
       GENEROUS SPACING & WHITE SPACE
    ============================================ */
    
    section,
    [class*="section"] {
      margin: 48px 0 !important;
    }

    h2 {
      font-size: 24px !important;
      font-weight: 700 !important;
      color: var(--text-primary) !important;
      margin: 32px 0 16px 0 !important;
    }

    h3 {
      font-size: 18px !important;
      font-weight: 600 !important;
      color: var(--text-primary) !important;
      margin: 24px 0 12px 0 !important;
    }

    /* Tables with Generous Padding */
    table {
      width: 100% !important;
      border-collapse: separate !important;
      border-spacing: 0 8px !important;
      margin: 24px 0 !important;
    }

    th {
      background: var(--card-bg) !important;
      color: var(--text-muted) !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
      padding: 16px 20px !important;
      text-align: left !important;
      border: none !important;
    }

    td {
      background: var(--card-bg) !important;
      color: var(--text-secondary) !important;
      padding: 20px !important;
      border: 1px solid var(--border-subtle) !important;
      font-size: 14px !important;
    }

    tr {
      transition: all 0.2s ease !important;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.03) !important;
      border-color: var(--primary-cyber) !important;
    }

    /* ============================================
       TEST REQUEST BUTTON (Large & Glowing)
    ============================================ */
    
    button[class*="send"],
    button[class*="test"],
    button[class*="execute"],
    [class*="test-button"] {
      width: 100% !important;
      padding: 18px 32px !important;
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric)) !important;
      border: none !important;
      border-radius: 12px !important;
      color: #ffffff !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      cursor: pointer !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      box-shadow: 0 4px 16px var(--primary-glow) !important;
      position: relative !important;
      overflow: hidden !important;
    }

    button[class*="send"]:hover,
    button[class*="test"]:hover,
    button[class*="execute"]:hover {
      transform: translateY(-3px) !important;
      box-shadow: var(--glow-shadow) !important;
    }

    button[class*="send"]::before,
    button[class*="test"]::before,
    button[class*="execute"]::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
      transition: left 0.5s;
    }

    button[class*="send"]:hover::before,
    button[class*="test"]:hover::before,
    button[class*="execute"]:hover::before {
      left: 100%;
    }

    /* ============================================
       RESPONSE PANEL (Terminal-Style Black Box)
    ============================================ */
    
    [class*="response"],
    [class*="result"],
    [class*="output"] {
      background: #000000 !important;
      border: 1px solid var(--primary-cyber) !important;
      border-radius: 12px !important;
      padding: 24px !important;
      margin-top: 24px !important;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace !important;
      font-size: 13px !important;
      color: #00ff00 !important;
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.6),
        inset 0 0 20px rgba(0, 242, 255, 0.1) !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
      max-height: 500px !important;
      overflow-y: auto !important;
    }

    [class*="response"]::-webkit-scrollbar,
    [class*="result"]::-webkit-scrollbar {
      width: 8px;
    }

    [class*="response"]::-webkit-scrollbar-track,
    [class*="result"]::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }

    [class*="response"]::-webkit-scrollbar-thumb,
    [class*="result"]::-webkit-scrollbar-thumb {
      background: var(--primary-cyber);
      border-radius: 4px;
    }

    /* ============================================
       HIGH-CONTRAST LABELS & VISIBILITY
    ============================================ */
    
    label,
    [class*="label"] {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: var(--text-primary) !important;
      margin-bottom: 8px !important;
      display: block !important;
    }

    /* Required Badge */
    [class*="required"],
    .required {
      color: var(--danger-red) !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      background: rgba(248, 81, 73, 0.1) !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      margin-left: 8px !important;
    }

    /* Type Badge */
    [class*="type"],
    .type {
      color: var(--info-blue) !important;
      font-weight: 600 !important;
      font-size: 12px !important;
      font-family: 'JetBrains Mono', monospace !important;
      background: rgba(88, 166, 255, 0.1) !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
    }

    /* Default Value */
    [class*="default"],
    .default {
      color: var(--text-muted) !important;
      font-size: 12px !important;
      font-style: italic !important;
    }

    /* ============================================
       INPUT FIELDS & FORMS
    ============================================ */
    
    input,
    textarea,
    select {
      width: 100% !important;
      background: var(--deep-black) !important;
      border: 1px solid var(--border-subtle) !important;
      border-radius: 8px !important;
      padding: 12px 16px !important;
      color: var(--text-primary) !important;
      font-size: 14px !important;
      transition: all 0.2s ease !important;
    }

    input:focus,
    textarea:focus,
    select:focus {
      outline: none !important;
      border-color: var(--primary-cyber) !important;
      box-shadow: 0 0 0 3px var(--primary-glow) !important;
    }

    /* ============================================
       CODE BLOCKS & SYNTAX HIGHLIGHTING
    ============================================ */
    
    pre {
      background: #011627 !important;
      border: 1px solid rgba(0, 242, 255, 0.2) !important;
      border-radius: 12px !important;
      padding: 24px !important;
      overflow-x: auto !important;
      margin: 16px 0 !important;
    }

    pre code {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      color: #d6deeb !important;
      font-size: 13px !important;
      line-height: 1.7 !important;
    }

    /* ============================================
       SCROLLBAR STYLING
    ============================================ */
    
    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track {
      background: var(--deep-black);
    }

    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, var(--primary-cyber), var(--purple-electric));
      border-radius: 5px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--primary-cyber);
    }

    /* ============================================
       Z-INDEX MANAGEMENT
    ============================================ */
    
    .sidebar,
    [class*="sidebar"] {
      z-index: 1000 !important;
    }

    [class*="modal"],
    [class*="overlay"] {
      z-index: 2000 !important;
    }

    [class*="tooltip"],
    [class*="popover"] {
      z-index: 3000 !important;
    }

    /* ============================================
       RESPONSIVE ADJUSTMENTS
    ============================================ */
    
    @media (max-width: 1200px) {
      [class*="panels"],
      [class*="columns"],
      [class*="grid"] {
        grid-template-columns: 1fr !important;
      }
      
      main,
      [class*="content"] {
        padding: 32px 24px !important;
      }
    }

    @media (max-width: 768px) {
      .sidebar,
      [class*="sidebar"] {
        width: 100% !important;
        position: relative !important;
        height: auto !important;
      }
      
      main,
      [class*="content"] {
        margin-left: 0 !important;
      }
    }

    /* ============================================
       BRANDING BADGES
    ============================================ */
    
    /* Powered by Nest-Scramble Badge (Bottom of Sidebar) */
    .sidebar::after,
    [class*="sidebar"]::after {
      content: '✨ Powered by Nest-Scramble';
      display: block;
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 20px 24px;
      background: linear-gradient(135deg, var(--primary-cyber), var(--purple-electric));
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.5px;
      color: #ffffff;
      animation: badgePulse 3s ease-in-out infinite;
      cursor: pointer;
    }

    @keyframes badgePulse {
      0%, 100% { 
        box-shadow: 0 -4px 20px ${primaryColor}20;
      }
      50% { 
        box-shadow: 0 -4px 30px ${primaryColor}40;
      }
    }
    
    /* Ensure sidebar has padding for the badge */
    .sidebar,
    [class*="sidebar"] {
      padding-bottom: 80px !important;
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