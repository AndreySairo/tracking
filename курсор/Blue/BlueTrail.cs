using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

// ---------------------------------------------------------------------------
//  BlueTrail - светящийся голубой шлейф за системным курсором Windows.
//  Прозрачное окно поверх всех окон, сквозное для мыши; рисуется через
//  UpdateLayeredWindow, поэтому у него настоящая попиксельная прозрачность.
// ---------------------------------------------------------------------------

static class Cfg
{
    public static int   TrailMs   = 250;    // сколько живёт хвост, мс
    public static float Thickness = 5.0f;   // толщина ядра линии у курсора, px
    public static float MinDist   = 2.0f;   // минимальный шаг между точками, px
    public static int   Fps       = 120;    // ограничение частоты кадров
    public static float GlowScale = 4.0f;   // во сколько раз ореол шире ядра
    public static float Opacity   = 1.0f;   // общий множитель непрозрачности
    public static int   Bands     = 14;     // на сколько участков делится хвост
    public static Color Core = Color.FromArgb(205, 230, 255);
    public static Color Mid  = Color.FromArgb(105, 175, 255);
    public static Color Glow = Color.FromArgb(30, 110, 235);

    static Color ParseColor(string s, Color def)
    {
        string[] p = s.Split(new char[] { ',' });
        if (p.Length != 3) return def;
        try
        {
            return Color.FromArgb(
                int.Parse(p[0].Trim()), int.Parse(p[1].Trim()), int.Parse(p[2].Trim()));
        }
        catch { return def; }
    }

    static float F(string s, float def)
    {
        float v;
        if (float.TryParse(s.Trim().Replace(',', '.'), NumberStyles.Float,
            CultureInfo.InvariantCulture, out v)) return v;
        return def;
    }

    public static void Load(string path)
    {
        if (!File.Exists(path)) { Save(path); return; }
        foreach (string raw in File.ReadAllLines(path))
        {
            string line = raw.Trim();
            if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#")) continue;
            int eq = line.IndexOf('=');
            if (eq <= 0) continue;
            string k = line.Substring(0, eq).Trim().ToLowerInvariant();
            string v = line.Substring(eq + 1).Trim();
            switch (k)
            {
                case "trailms":   TrailMs   = (int)F(v, TrailMs);   break;
                case "thickness": Thickness = F(v, Thickness);      break;
                case "mindist":   MinDist   = F(v, MinDist);        break;
                case "fps":       Fps       = (int)F(v, Fps);       break;
                case "glowscale": GlowScale = F(v, GlowScale);      break;
                case "opacity":   Opacity   = F(v, Opacity);        break;
                case "bands":     Bands     = (int)F(v, Bands);     break;
                case "corecolor": Core = ParseColor(v, Core);       break;
                case "midcolor":  Mid  = ParseColor(v, Mid);        break;
                case "glowcolor": Glow = ParseColor(v, Glow);       break;
            }
        }
        if (TrailMs < 20) TrailMs = 20;
        if (Fps < 30) Fps = 30;
        if (Fps > 240) Fps = 240;
        if (Bands < 2) Bands = 2;
        if (Thickness < 0.5f) Thickness = 0.5f;
    }

    public static void Save(string path)
    {
        StreamWriter w = new StreamWriter(path, false, System.Text.Encoding.UTF8);
        w.WriteLine("; BlueTrail - настройки шлейфа. Файл читается при запуске.");
        w.WriteLine("; После правки перезапустите программу (в меню значка - Выход).");
        w.WriteLine();
        w.WriteLine("; Время жизни хвоста в миллисекундах. 250 - мягкий след,");
        w.WriteLine("; 50 - почти незаметный смаз, 600 - длинная лента.");
        w.WriteLine("TrailMs=" + TrailMs);
        w.WriteLine();
        w.WriteLine("; Толщина яркого ядра линии в пикселях у самого курсора.");
        w.WriteLine("Thickness=" + Thickness.ToString(CultureInfo.InvariantCulture));
        w.WriteLine();
        w.WriteLine("; Во сколько раз светящийся ореол шире ядра.");
        w.WriteLine("GlowScale=" + GlowScale.ToString(CultureInfo.InvariantCulture));
        w.WriteLine();
        w.WriteLine("; Общая непрозрачность: 1.0 - как задумано, 0.5 - вдвое бледнее.");
        w.WriteLine("Opacity=" + Opacity.ToString(CultureInfo.InvariantCulture));
        w.WriteLine();
        w.WriteLine("; Цвета в формате R,G,B: ядро, середина, внешний ореол.");
        w.WriteLine("CoreColor=" + Core.R + "," + Core.G + "," + Core.B);
        w.WriteLine("MidColor=" + Mid.R + "," + Mid.G + "," + Mid.B);
        w.WriteLine("GlowColor=" + Glow.R + "," + Glow.G + "," + Glow.B);
        w.WriteLine();
        w.WriteLine("; Служебное: шаг набора точек (px), кадров в секунду,");
        w.WriteLine("; на сколько участков делится хвост при отрисовке.");
        w.WriteLine("MinDist=" + MinDist.ToString(CultureInfo.InvariantCulture));
        w.WriteLine("Fps=" + Fps);
        w.WriteLine("Bands=" + Bands);
        w.Close();
    }
}

struct TrailPt
{
    public float X, Y;
    public long  T;
    public TrailPt(float x, float y, long t) { X = x; Y = y; T = t; }
}

class TrailForm : Form
{
    // --- WinAPI ------------------------------------------------------------
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst,
        ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey,
        ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after,
        int x, int y, int cx, int cy, uint flags);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
    [DllImport("gdi32.dll")] static extern IntPtr CreateDIBSection(IntPtr hdc,
        ref BITMAPINFO bmi, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint ms);
    [DllImport("winmm.dll")] static extern uint timeEndPeriod(uint ms);
    [DllImport("user32.dll")] static extern bool PeekMessage(out MSG m, IntPtr h,
        uint min, uint max, uint remove);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y;
        public POINT(int x, int y) { X = x; Y = y; } }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy;
        public SIZE(int a, int b) { cx = a; cy = b; } }
    [StructLayout(LayoutKind.Sequential)] struct MSG {
        public IntPtr hwnd; public uint msg; public IntPtr w, l; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION {
        public byte Op, Flags, Alpha, Format; }
    [StructLayout(LayoutKind.Sequential)] struct BITMAPINFOHEADER {
        public uint biSize; public int biWidth, biHeight;
        public ushort biPlanes, biBitCount; public uint biCompression, biSizeImage;
        public int biXPelsPerMeter, biYPelsPerMeter; public uint biClrUsed, biClrImportant; }
    [StructLayout(LayoutKind.Sequential)] struct BITMAPINFO {
        public BITMAPINFOHEADER bmiHeader; public uint bmiColors; }

    const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20,
              WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x8000000, WS_EX_TOPMOST = 0x8;
    const int SW_HIDE = 0, SW_SHOWNOACTIVATE = 4;
    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    const uint SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1, SWP_NOACTIVATE = 0x10;

    // --- поверхность отрисовки --------------------------------------------
    IntPtr memDC = IntPtr.Zero, hDib = IntPtr.Zero, hOld = IntPtr.Zero;
    Bitmap surface;
    Graphics gfx;
    Rectangle vs;                       // виртуальный экран (все мониторы)
    Rectangle prevRect = Rectangle.Empty;
    bool shown = false;

    readonly List<TrailPt> pts = new List<TrailPt>();
    readonly Stopwatch clock = Stopwatch.StartNew();
    long lastFrame = 0, lastTopmost = 0;
    public bool Paused = false;

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW
                        | WS_EX_NOACTIVATE | WS_EX_TOPMOST;
            return cp;
        }
    }

    public TrailForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = new Rectangle(0, 0, 1, 1);
        BuildSurface();
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += new EventHandler(OnDisplayChanged);
        timeBeginPeriod(1);
        Application.Idle += new EventHandler(OnIdle);
    }

    void OnDisplayChanged(object sender, EventArgs e) { BuildSurface(); }

    void BuildSurface()
    {
        FreeSurface();
        vs = SystemInformation.VirtualScreen;
        if (vs.Width < 1 || vs.Height < 1) vs = new Rectangle(0, 0, 1920, 1080);

        BITMAPINFO bmi = new BITMAPINFO();
        bmi.bmiHeader.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER));
        bmi.bmiHeader.biWidth = vs.Width;
        bmi.bmiHeader.biHeight = -vs.Height;      // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = 0;          // BI_RGB

        IntPtr screen = GetDC(IntPtr.Zero);
        IntPtr bits;
        hDib = CreateDIBSection(screen, ref bmi, 0, out bits, IntPtr.Zero, 0);
        memDC = CreateCompatibleDC(screen);
        ReleaseDC(IntPtr.Zero, screen);
        hOld = SelectObject(memDC, hDib);

        // GDI+ рисует прямо в память DIB-секции; PArgb - premultiplied alpha,
        // именно этого ждёт UpdateLayeredWindow.
        surface = new Bitmap(vs.Width, vs.Height, vs.Width * 4,
                             PixelFormat.Format32bppPArgb, bits);
        gfx = Graphics.FromImage(surface);
        gfx.SmoothingMode = SmoothingMode.AntiAlias;
        gfx.InterpolationMode = InterpolationMode.Bilinear;
        prevRect = Rectangle.Empty;
    }

    void FreeSurface()
    {
        if (gfx != null) { gfx.Dispose(); gfx = null; }
        if (surface != null) { surface.Dispose(); surface = null; }
        if (memDC != IntPtr.Zero)
        {
            if (hOld != IntPtr.Zero) SelectObject(memDC, hOld);
            DeleteDC(memDC); memDC = IntPtr.Zero; hOld = IntPtr.Zero;
        }
        if (hDib != IntPtr.Zero) { DeleteObject(hDib); hDib = IntPtr.Zero; }
    }

    // --- цикл кадров -------------------------------------------------------
    static bool AppIdle { get { MSG m; return !PeekMessage(out m, IntPtr.Zero, 0, 0, 0); } }

    void OnIdle(object sender, EventArgs e)
    {
        while (AppIdle)
        {
            long now = clock.ElapsedMilliseconds;
            int minFrame = 1000 / Cfg.Fps;
            if (now - lastFrame >= minFrame) { lastFrame = now; Tick(now); }
            Thread.Sleep(pts.Count == 0 ? 12 : 1);
        }
    }

    void Tick(long now)
    {
        if (Paused)
        {
            if (pts.Count > 0) { pts.Clear(); HideOverlay(); }
            return;
        }

        POINT c;
        if (GetCursorPos(out c))
        {
            if (pts.Count == 0)
                pts.Add(new TrailPt(c.X, c.Y, now));
            else
            {
                TrailPt last = pts[pts.Count - 1];
                float dx = c.X - last.X, dy = c.Y - last.Y;
                if (dx * dx + dy * dy >= Cfg.MinDist * Cfg.MinDist)
                    pts.Add(new TrailPt(c.X, c.Y, now));
            }
        }

        while (pts.Count > 0 && now - pts[0].T > Cfg.TrailMs) pts.RemoveAt(0);

        if (pts.Count < 2) { HideOverlay(); return; }

        Render(now);
    }

    void HideOverlay()
    {
        if (shown) { ShowWindow(Handle, SW_HIDE); shown = false; prevRect = Rectangle.Empty; }
    }

    static float Clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

    void Render(long now)
    {
        int n = pts.Count;
        float pad = Cfg.Thickness * Cfg.GlowScale * 0.5f + 3f;

        float minX = float.MaxValue, minY = float.MaxValue,
              maxX = float.MinValue, maxY = float.MinValue;
        for (int i = 0; i < n; i++)
        {
            if (pts[i].X < minX) minX = pts[i].X;
            if (pts[i].X > maxX) maxX = pts[i].X;
            if (pts[i].Y < minY) minY = pts[i].Y;
            if (pts[i].Y > maxY) maxY = pts[i].Y;
        }
        Rectangle box = Rectangle.FromLTRB(
            (int)Math.Floor(minX - pad) - vs.X, (int)Math.Floor(minY - pad) - vs.Y,
            (int)Math.Ceiling(maxX + pad) - vs.X, (int)Math.Ceiling(maxY + pad) - vs.Y);
        box.Intersect(new Rectangle(0, 0, vs.Width, vs.Height));
        if (box.Width < 1 || box.Height < 1) { HideOverlay(); return; }

        // очистка: текущая область плюс область прошлого кадра
        Rectangle clear = prevRect.IsEmpty ? box : Rectangle.Union(prevRect, box);
        clear.Intersect(new Rectangle(0, 0, vs.Width, vs.Height));
        gfx.CompositingMode = CompositingMode.SourceCopy;
        gfx.FillRectangle(Brushes.Transparent, clear);
        gfx.CompositingMode = CompositingMode.SourceOver;

        // хвост режется на участки одинакового возраста: внутри участка
        // одна линия одной прозрачности, поэтому нет наложения отрезков
        int segs = n - 1;
        int bands = Math.Min(Cfg.Bands, segs);
        Pen pen = new Pen(Color.White, 1f);
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        pen.LineJoin = LineJoin.Round;

        for (int pass = 0; pass < 3; pass++)
        {
            for (int b = 0; b < bands; b++)
            {
                int i0 = (int)Math.Round((double)b * segs / bands);
                int i1 = (int)Math.Round((double)(b + 1) * segs / bands);
                if (i1 <= i0) continue;

                PointF[] poly = new PointF[i1 - i0 + 1];
                for (int i = i0; i <= i1; i++)
                    poly[i - i0] = new PointF(pts[i].X - vs.X, pts[i].Y - vs.Y);

                int mid = (i0 + i1) / 2;
                float w = Clamp01(1f - (float)(now - pts[mid].T) / Cfg.TrailMs);
                if (w <= 0.001f) continue;

                float fade = w * w;                       // мягкое затухание
                float width = Cfg.Thickness * (0.20f + 0.80f * w);
                float a; Color col;
                if (pass == 0)      { a = fade * 0.11f; width *= Cfg.GlowScale;        col = Cfg.Glow; }
                else if (pass == 1) { a = fade * 0.24f; width *= Cfg.GlowScale * 0.5f; col = Cfg.Mid;  }
                else                { a = fade * 0.85f;                                col = Cfg.Core; }

                a *= Cfg.Opacity;
                int ai = (int)Math.Round(Clamp01(a) * 255f);
                if (ai <= 0) continue;

                pen.Color = Color.FromArgb(ai, col);
                pen.Width = Math.Max(0.6f, width);
                gfx.DrawLines(pen, poly);
            }
        }
        pen.Dispose();

        POINT ptDst = new POINT(vs.X + box.X, vs.Y + box.Y);
        SIZE size = new SIZE(box.Width, box.Height);
        POINT ptSrc = new POINT(box.X, box.Y);
        BLENDFUNCTION blend = new BLENDFUNCTION();
        blend.Op = 0;            // AC_SRC_OVER
        blend.Alpha = 255;
        blend.Format = 1;        // AC_SRC_ALPHA

        if (!shown) { ShowWindow(Handle, SW_SHOWNOACTIVATE); shown = true; }

        IntPtr screen = GetDC(IntPtr.Zero);
        UpdateLayeredWindow(Handle, screen, ref ptDst, ref size, memDC, ref ptSrc,
                            0, ref blend, 2 /* ULW_ALPHA */);
        ReleaseDC(IntPtr.Zero, screen);
        prevRect = box;

        // другие окна тоже бывают topmost - изредка возвращаем себя наверх
        if (now - lastTopmost > 2000)
        {
            lastTopmost = now;
            SetWindowPos(Handle, HWND_TOPMOST, 0, 0, 0, 0,
                         SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }

    protected override void OnPaintBackground(PaintEventArgs e) { }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Application.Idle -= new EventHandler(OnIdle);
            Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= new EventHandler(OnDisplayChanged);
            timeEndPeriod(1);
            FreeSurface();
        }
        base.Dispose(disposing);
    }
}

class TrayContext : ApplicationContext
{
    readonly NotifyIcon icon;
    readonly TrailForm form;
    readonly MenuItem pauseItem;

    public TrayContext()
    {
        form = new TrailForm();
        form.Show();

        pauseItem = new MenuItem("Пауза", new EventHandler(OnPause));
        ContextMenu menu = new ContextMenu(new MenuItem[] {
            pauseItem,
            new MenuItem("Настройки (файл BlueTrail.ini)", new EventHandler(OnOpenIni)),
            new MenuItem("-"),
            new MenuItem("Выход", new EventHandler(OnExit))
        });

        icon = new NotifyIcon();
        icon.Icon = MakeIcon();
        icon.Text = "BlueTrail - шлейф за курсором";
        icon.ContextMenu = menu;
        icon.Visible = true;
        icon.DoubleClick += new EventHandler(OnPause);
    }

    static Icon MakeIcon()
    {
        Bitmap b = new Bitmap(32, 32, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (Pen p = new Pen(Color.FromArgb(120, 30, 110, 235), 9f))
                g.DrawEllipse(p, 6, 6, 20, 20);
            using (Pen p = new Pen(Color.FromArgb(255, 205, 230, 255), 4f))
                g.DrawEllipse(p, 6, 6, 20, 20);
        }
        IntPtr h = b.GetHicon();
        Icon ico = (Icon)Icon.FromHandle(h).Clone();
        b.Dispose();
        return ico;
    }

    void OnPause(object s, EventArgs e)
    {
        form.Paused = !form.Paused;
        pauseItem.Checked = form.Paused;
        icon.Text = form.Paused ? "BlueTrail - пауза" : "BlueTrail - шлейф за курсором";
    }

    void OnOpenIni(object s, EventArgs e)
    {
        try { Process.Start("notepad.exe", Program.IniPath); } catch { }
    }

    void OnExit(object s, EventArgs e)
    {
        icon.Visible = false;
        icon.Dispose();
        form.Close();
        ExitThread();
    }
}

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    public static string IniPath;

    [STAThread]
    static void Main()
    {
        try { SetProcessDPIAware(); } catch { }

        string dir = Path.GetDirectoryName(Application.ExecutablePath);
        IniPath = Path.Combine(dir, "BlueTrail.ini");
        Cfg.Load(IniPath);

        bool created;
        Mutex mutex = new Mutex(true, "BlueTrailSingleInstance", out created);
        if (!created) return;                 // уже запущено

        Application.EnableVisualStyles();
        Application.Run(new TrayContext());
        GC.KeepAlive(mutex);
    }
}
