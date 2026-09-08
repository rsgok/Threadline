import Foundation
import Vision

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true
do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1])).perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    let data = try JSONSerialization.data(withJSONObject: ["text": text])
    print(String(data: data, encoding: .utf8)!)
} catch {
    fputs("Image recognition failed\n", stderr)
    exit(1)
}
