import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation
import Speech

func emit(_ payload: [String: Any]) {
    do {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
        let fallback = "{\"type\":\"error\",\"code\":\"serialization_failed\",\"message\":\"Failed to serialize helper output\"}\n"
        FileHandle.standardOutput.write(Data(fallback.utf8))
    }
}

func authorizationLabel(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}

func microphoneAuthorizationLabel(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "unknown"
    }
}

func argumentValue(_ name: String, fallback: String) -> String {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else {
        return fallback
    }
    return args[index + 1]
}

func optionalArgumentValue(_ name: String) -> String? {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else {
        return nil
    }
    let value = args[index + 1].trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
}

func normalizedLocaleIdentifier(_ locale: Locale) -> String {
    locale.identifier.replacingOccurrences(of: "_", with: "-")
}

func argumentDouble(_ name: String, fallback: Double) -> Double {
    Double(argumentValue(name, fallback: String(fallback))) ?? fallback
}

func argumentInt(_ name: String, fallback: Int) -> Int {
    Int(argumentValue(name, fallback: String(fallback))) ?? fallback
}

func emitCapability() {
    if #available(macOS 10.15, *) {
        let requestedLocaleIdentifier = optionalArgumentValue("--locale")
        let recognizer: SFSpeechRecognizer?
        if let requestedLocaleIdentifier {
            recognizer = SFSpeechRecognizer(locale: Locale(identifier: requestedLocaleIdentifier))
        } else {
            recognizer = SFSpeechRecognizer()
        }
        let localeIdentifier = recognizer.map { normalizedLocaleIdentifier($0.locale) } ?? requestedLocaleIdentifier ?? normalizedLocaleIdentifier(Locale.current)
        emit([
            "type": "capability",
            "available": recognizer != nil,
            "platform": "darwin",
            "locale": localeIdentifier,
            "speechAuthorization": authorizationLabel(SFSpeechRecognizer.authorizationStatus()),
            "microphoneAuthorization": microphoneAuthorizationLabel(AVCaptureDevice.authorizationStatus(for: .audio)),
            "supportsOnDeviceRecognition": recognizer?.supportsOnDeviceRecognition ?? false,
            "reason": recognizer == nil ? "locale_unavailable" : NSNull(),
        ])
    } else {
        emit([
            "type": "capability",
            "available": false,
            "platform": "darwin",
            "speechAuthorization": "unsupported",
            "microphoneAuthorization": microphoneAuthorizationLabel(AVCaptureDevice.authorizationStatus(for: .audio)),
            "supportsOnDeviceRecognition": false,
            "reason": "macos_version_unsupported",
        ])
    }
}

func coreAudioDefaultInputDeviceUID() -> String? {
    var defaultDeviceID = AudioDeviceID(0)
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &defaultDeviceID)
    guard status == noErr, defaultDeviceID != 0 else { return nil }
    return coreAudioDeviceUID(for: defaultDeviceID)
}

func coreAudioDeviceUID(for deviceID: AudioDeviceID) -> String? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(deviceID, &address, 0, nil, &size) == noErr else { return nil }
    var uid: CFString = "" as CFString
    var mutableSize = size
    let status = withUnsafeMutablePointer(to: &uid) { pointer in
        AudioObjectGetPropertyData(deviceID, &address, 0, nil, &mutableSize, pointer)
    }
    guard status == noErr else { return nil }
    return uid as String
}

func coreAudioDeviceID(forUID uid: String) -> AudioDeviceID? {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size) == noErr else { return nil }
    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = Array(repeating: AudioDeviceID(0), count: count)
    var mutableSize = size
    let status = deviceIDs.withUnsafeMutableBufferPointer { buffer -> OSStatus in
        guard let baseAddress = buffer.baseAddress else { return -1 }
        return AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &mutableSize, baseAddress)
    }
    guard status == noErr else { return nil }
    return deviceIDs.first { coreAudioDeviceUID(for: $0) == uid }
}

func emitInputDevices() {
    let defaultUID = coreAudioDefaultInputDeviceUID()
    let devices = AVCaptureDevice.devices(for: .audio).map { device in
        [
            "id": device.uniqueID,
            "name": device.localizedName,
            "isDefault": device.uniqueID == defaultUID,
        ] as [String: Any]
    }
    emit(["type": "devices", "devices": devices])
}

func emitAuthorization() {
    if #available(macOS 10.15, *) {
        SFSpeechRecognizer.requestAuthorization { _ in
            requestMicrophoneAuthorization { _ in
                emitCapability()
                CFRunLoopStop(CFRunLoopGetMain())
            }
        }
        RunLoop.main.run()
    } else {
        emitCapability()
    }
}

func requestMicrophoneAuthorization(_ completion: @escaping (Bool) -> Void) {
    let status = AVCaptureDevice.authorizationStatus(for: .audio)
    switch status {
    case .authorized:
        completion(true)
    case .notDetermined:
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            DispatchQueue.main.async {
                completion(granted)
            }
        }
    case .denied, .restricted:
        completion(false)
    @unknown default:
        completion(false)
    }
}

final class StdinCommandReader {
    private let onCommand: (String) -> Void
    private var isActive = true

    init(onCommand: @escaping (String) -> Void) {
        self.onCommand = onCommand
    }

    func start() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            while let line = readLine() {
                guard let self, self.isActive else { return }
                let command = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !command.isEmpty else { continue }
                self.onCommand(command)
            }
        }
    }

    func stop() {
        isActive = false
    }
}

@available(macOS 10.15, *)
final class LiveSpeechRecognizer {
    private let localeIdentifier: String?
    private let inputDeviceId: String?
    private let silenceThresholdDb: Double
    private let silenceHoldMs: Int
    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isRunning = false
    private var isRestarting = false
    private var didStop = false
    private var emittedStarted = false
    private var lastTranscript = ""
    private var lastFinalTranscript = ""
    private var hasSpeech = false
    private var lastVoiceActivity = Date.distantPast
    private var lastLevelEmit = Date.distantPast
    private var activeLocaleIdentifier = ""
    private var recognitionGeneration = 0

    init(localeIdentifier: String?, inputDeviceId: String?, silenceThresholdDb: Double, silenceHoldMs: Int) {
        self.localeIdentifier = localeIdentifier
        self.inputDeviceId = inputDeviceId
        self.silenceThresholdDb = silenceThresholdDb
        self.silenceHoldMs = max(300, silenceHoldMs)
    }

    func run() {
        if let localeIdentifier {
            recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier))
        } else {
            // No app override: use Apple's default recognizer so macOS controls the recognition language.
            recognizer = SFSpeechRecognizer()
        }
        guard let recognizer else {
            let label = localeIdentifier ?? "the system default speech language"
            emitError("locale_unavailable", "macOS Speech is not available for \(label).")
            CFRunLoopStop(CFRunLoopGetMain())
            return
        }
        activeLocaleIdentifier = normalizedLocaleIdentifier(recognizer.locale)

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                guard status == .authorized else {
                    self.emitError("speech_permission_denied", "Speech Recognition permission is not enabled for DevRyan.")
                    CFRunLoopStop(CFRunLoopGetMain())
                    return
                }

                requestMicrophoneAuthorization { granted in
                    guard granted else {
                        self.emitError("microphone_permission_denied", "Microphone permission is not enabled for DevRyan.")
                        CFRunLoopStop(CFRunLoopGetMain())
                        return
                    }

                    self.isRunning = true
                    self.startRecognitionCycle()
                }
            }
        }
    }

    func stop() {
        guard !didStop else { return }
        didStop = true
        isRunning = false
        recognitionGeneration += 1
        stopRecognitionCycle()
        emit(["type": "stopped"])
        CFRunLoopStop(CFRunLoopGetMain())
    }

    private func startRecognitionCycle() {
        guard isRunning, !didStop else { return }
        isRestarting = false
        hasSpeech = false
        lastTranscript = ""
        lastVoiceActivity = Date.distantPast

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.isRunning, !self.didStop else { return }

                if let result {
                    let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !text.isEmpty && text != self.lastTranscript && !result.isFinal {
                        self.lastTranscript = text
                        emit(["type": "transcript", "text": text, "isFinal": false])
                    }
                    if result.isFinal {
                        self.emitFinalTranscript(text)
                        self.restartRecognitionCycle()
                        return
                    }
                }

                if let error {
                    let message = error.localizedDescription
                    if self.isRestarting || !self.isRunning || message.lowercased().contains("cancel") {
                        return
                    }
                    self.emitError("recognition_failed", message)
                    self.stop()
                }
            }
        }

        do {
            let inputNode = audioEngine.inputNode
            if let inputDeviceId, !inputDeviceId.isEmpty {
                guard let deviceID = coreAudioDeviceID(forUID: inputDeviceId) else {
                    emitError("input_device_unavailable", "The selected microphone is not available.")
                    stop()
                    return
                }
                guard let audioUnit = inputNode.audioUnit else {
                    emitError("input_device_unavailable", "macOS could not select the requested microphone.")
                    stop()
                    return
                }
                var mutableDeviceID = deviceID
                let status = AudioUnitSetProperty(
                    audioUnit,
                    kAudioOutputUnitProperty_CurrentDevice,
                    kAudioUnitScope_Global,
                    0,
                    &mutableDeviceID,
                    UInt32(MemoryLayout<AudioDeviceID>.size)
                )
                guard status == noErr else {
                    emitError("input_device_unavailable", "macOS could not switch to the selected microphone.")
                    stop()
                    return
                }
            }
            let format = inputNode.outputFormat(forBus: 0)
            guard format.channelCount > 0 else {
                emitError("microphone_unavailable", "No microphone input format is available.")
                stop()
                return
            }

            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let self else { return }
                self.recognitionRequest?.append(buffer)
                self.observeAudioLevel(buffer)
            }

            if !audioEngine.isRunning {
                audioEngine.prepare()
                try audioEngine.start()
            }

            if !emittedStarted {
                emittedStarted = true
                emit(["type": "started", "locale": activeLocaleIdentifier])
            }
        } catch {
            emitError("microphone_start_failed", error.localizedDescription)
            stop()
        }
    }

    private func observeAudioLevel(_ buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return }

        var sum: Float = 0
        for index in 0..<frameLength {
            let sample = channelData[index]
            sum += sample * sample
        }

        let rms = sqrt(sum / Float(frameLength))
        let db = 20 * log10(max(Double(rms), 0.000_000_1))
        let now = Date()
        let normalizedLevel = max(0, min(1, (db + 60) / 50))

        DispatchQueue.main.async { [weak self] in
            guard let self, self.isRunning, !self.didStop else { return }
            if now.timeIntervalSince(self.lastLevelEmit) >= 0.08 {
                self.lastLevelEmit = now
                emit(["type": "level", "level": normalizedLevel])
            }
            if db >= self.silenceThresholdDb {
                self.hasSpeech = true
                self.lastVoiceActivity = now
                return
            }

            guard self.hasSpeech else { return }
            let silentForMs = now.timeIntervalSince(self.lastVoiceActivity) * 1000
            if silentForMs >= Double(self.silenceHoldMs) {
                self.finalizeUtteranceFromSilence()
            }
        }
    }

    private func finalizeUtteranceFromSilence() {
        guard isRunning, !didStop else { return }
        emitFinalTranscript(lastTranscript, reason: "silence")
        restartRecognitionCycle()
    }

    private func emitFinalTranscript(_ rawText: String, reason: String = "recognizer-final") {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != lastFinalTranscript else { return }
        lastFinalTranscript = text
        emit(["type": "transcript", "text": text, "isFinal": true, "finalReason": reason])
    }

    private func restartRecognitionCycle() {
        guard isRunning, !didStop else { return }
        isRestarting = true
        recognitionGeneration += 1
        let generation = recognitionGeneration
        stopRecognitionCycle()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self, self.isRunning, !self.didStop, self.recognitionGeneration == generation else { return }
            self.startRecognitionCycle()
        }
    }

    private func stopRecognitionCycle() {
        isRestarting = true
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.reset()
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        hasSpeech = false
        lastTranscript = ""
    }

    private func emitError(_ code: String, _ message: String) {
        emit(["type": "error", "code": code, "message": message])
    }
}

if CommandLine.arguments.contains("--capability") {
    emitCapability()
    exit(0)
}

if CommandLine.arguments.contains("--devices") {
    emitInputDevices()
    exit(0)
}

if CommandLine.arguments.contains("--authorize") {
    emitAuthorization()
    exit(0)
}

if CommandLine.arguments.contains("--recognize") {
    if #available(macOS 10.15, *) {
        let helper = LiveSpeechRecognizer(
            localeIdentifier: optionalArgumentValue("--locale"),
            inputDeviceId: optionalArgumentValue("--input-device-id"),
            silenceThresholdDb: argumentDouble("--silence-threshold-db", fallback: -42),
            silenceHoldMs: argumentInt("--silence-hold-ms", fallback: 1200)
        )
        let stdinReader = StdinCommandReader { command in
            guard command == "stop" else { return }
            DispatchQueue.main.async {
                helper.stop()
            }
        }

        signal(SIGINT) { _ in CFRunLoopStop(CFRunLoopGetMain()) }
        signal(SIGTERM) { _ in CFRunLoopStop(CFRunLoopGetMain()) }

        stdinReader.start()
        helper.run()
        RunLoop.main.run()
        helper.stop()
        stdinReader.stop()
        exit(0)
    } else {
        emit(["type": "error", "code": "macos_version_unsupported", "message": "macOS Speech requires macOS 10.15 or newer."])
        exit(1)
    }
}

emit(["type": "error", "code": "invalid_command", "message": "Use --capability, --devices, --authorize, or --recognize."])
exit(2)
