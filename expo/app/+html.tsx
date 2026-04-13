import { ScrollViewStyleReset } from "expo-router/html";
import React from "react";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>Журнал мастера</title>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;800;900&subset=cyrillic,cyrillic-ext,latin,latin-ext&display=swap"
          rel="stylesheet"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                margin: 0;
                padding: 0;
                height: 100%;
                overflow: hidden;
                font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              * {
                font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
                box-sizing: border-box;
              }
              [dir] div, [dir] span, [dir] p, [dir] input, [dir] textarea {
                font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
              }
              #root {
                display: flex;
                flex: 1;
                height: 100vh;
                width: 100vw;
              }
              input, textarea, select, button {
                font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif !important;
              }
              ::-webkit-scrollbar {
                width: 6px;
              }
              ::-webkit-scrollbar-track {
                background: transparent;
              }
              ::-webkit-scrollbar-thumb {
                background: rgba(128,128,128,0.3);
                border-radius: 3px;
              }
              ::-webkit-scrollbar-thumb:hover {
                background: rgba(128,128,128,0.5);
              }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (window.location.protocol === 'file:') {
                window.__EXPO_ROUTER_ORIGIN = window.location.href.replace(/\\/[^/]*$/, '/') || './';
                console.log('[Nativefier] file:// protocol detected, origin:', window.__EXPO_ROUTER_ORIGIN);
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
