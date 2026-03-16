import Cocoa

let size = 1024
let nsSize = NSSize(width: size, height: size)

// Create image with transparency
let image = NSImage(size: nsSize)
image.lockFocus()

let ctx = NSGraphicsContext.current!.cgContext

// Clear to transparent
ctx.clear(CGRect(origin: .zero, size: CGSize(width: size, height: size)))

// Draw macOS-style continuous rounded rect (squircle) with Apple-standard inset
// Apple spec: 824px icon body in 1024px canvas = ~10% padding per side
let inset: CGFloat = CGFloat(size) * 0.1
let iconRect = NSRect(x: inset, y: inset,
                      width: CGFloat(size) - inset * 2,
                      height: CGFloat(size) - inset * 2)
let cornerRadius: CGFloat = iconRect.width * 0.22
let path = NSBezierPath(roundedRect: iconRect,
                         xRadius: cornerRadius, yRadius: cornerRadius)

// Clip to squircle
ctx.saveGState()
path.addClip()

// Draw gradient background
let colorSpace = CGColorSpaceCreateDeviceRGB()
let colors = [
    CGColor(red: 0.388, green: 0.400, blue: 0.945, alpha: 1.0), // #6366F1
    CGColor(red: 0.545, green: 0.361, blue: 0.965, alpha: 1.0), // #8B5CF6
]
let gradient = CGGradient(colorsSpace: colorSpace, colors: colors as CFArray, locations: [0.0, 1.0])!
ctx.drawLinearGradient(gradient,
                        start: CGPoint(x: inset, y: CGFloat(size) - inset),
                        end: CGPoint(x: CGFloat(size) - inset, y: inset),
                        options: [])

// Draw "S" letter — sized relative to the icon body
let iconBody = iconRect.width
let fontSize: CGFloat = iconBody * 0.58
let font = NSFont.systemFont(ofSize: fontSize, weight: .bold)
let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor.white,
]
let str = NSAttributedString(string: "S", attributes: attrs)
let strSize = str.size()
let strX = iconRect.midX - strSize.width / 2
let strY = iconRect.midY - strSize.height / 2 + iconBody * 0.08
str.draw(at: NSPoint(x: strX, y: strY))

// Draw waveform bars — positioned relative to icon body
let barColor = NSColor(white: 1.0, alpha: 0.5)
barColor.setFill()

let barWidth: CGFloat = iconBody * 0.028
let barSpacing: CGFloat = iconBody * 0.050
let barCount = 9
let heights: [CGFloat] = [0.045, 0.065, 0.09, 0.078, 0.1, 0.078, 0.09, 0.065, 0.045]
let startX = iconRect.midX - CGFloat(barCount - 1) * barSpacing / 2 - barWidth / 2
let baseY: CGFloat = iconRect.minY + iconBody * 0.12

for i in 0..<barCount {
    let h = heights[i] * iconBody
    let x = startX + CGFloat(i) * barSpacing
    let barRect = NSRect(x: x, y: baseY, width: barWidth, height: h)
    let barPath = NSBezierPath(roundedRect: barRect, xRadius: barWidth / 2, yRadius: barWidth / 2)
    barPath.fill()
}

ctx.restoreGState()
image.unlockFocus()

// Save as PNG at multiple sizes
let outputDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."

func savePNG(_ img: NSImage, to path: String, pxSize: Int) {
    let targetSize = NSSize(width: pxSize, height: pxSize)
    let resized = NSImage(size: targetSize)
    resized.lockFocus()
    img.draw(in: NSRect(origin: .zero, size: targetSize),
             from: NSRect(origin: .zero, size: img.size),
             operation: .copy, fraction: 1.0)
    resized.unlockFocus()

    guard let tiff = resized.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        print("Failed to create PNG for size \(pxSize)")
        return
    }
    try! png.write(to: URL(fileURLWithPath: path))
}

// Generate iconset
let iconsetDir = "\(outputDir)/icon.iconset"
try! FileManager.default.createDirectory(atPath: iconsetDir, withIntermediateDirectories: true)

let sizes = [16, 32, 128, 256, 512]
for s in sizes {
    savePNG(image, to: "\(iconsetDir)/icon_\(s)x\(s).png", pxSize: s)
    let s2 = s * 2
    if s2 <= 1024 {
        savePNG(image, to: "\(iconsetDir)/icon_\(s)x\(s)@2x.png", pxSize: s2)
    }
}
savePNG(image, to: "\(iconsetDir)/icon_512x512@2x.png", pxSize: 1024)

// Also save 512px standalone PNG
savePNG(image, to: "\(outputDir)/icon.png", pxSize: 512)

print("Icon files generated successfully")
