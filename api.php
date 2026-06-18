<?php
/*
 * api.php — хранилище трекинг-дневника.
 * GET                 -> отдаёт всё содержимое data.json (конфиг + записи)
 * POST {action: ...}  -> save_record | delete_record | save_config
 * Данные лежат в data.json рядом со скриптом.
 */

header('Content-Type: application/json; charset=utf-8');

$DATA = __DIR__ . '/data.json';

$DEFAULT_ORDER = ['sleep', 'supplements', 'abstinence', 'productivity', 'comment', 'steps'];

function load_data($DATA, $DEFAULT_ORDER) {
    if (!file_exists($DATA)) {
        $init = [
            'config'  => ['fields' => [], 'order' => $DEFAULT_ORDER],
            'records' => [],
        ];
        save_data($DATA, $init);
        return $init;
    }
    $raw = file_get_contents($DATA);
    $d = json_decode($raw, true);
    if (!is_array($d)) {
        $d = ['config' => ['fields' => [], 'order' => $DEFAULT_ORDER], 'records' => []];
    }
    if (!isset($d['config'])) $d['config'] = ['fields' => [], 'order' => $DEFAULT_ORDER];
    if (!isset($d['records'])) $d['records'] = [];
    return $d;
}

function save_data($DATA, $d) {
    $json = json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    file_put_contents($DATA, $json, LOCK_EX);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    echo json_encode(load_data($DATA, $DEFAULT_ORDER), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) { http_response_code(400); echo json_encode(['error' => 'bad body']); exit; }

    $action = $body['action'] ?? '';
    $d = load_data($DATA, $DEFAULT_ORDER);

    switch ($action) {
        case 'save_record':
            $rec = $body['record'] ?? null;
            if (!$rec || empty($rec['date'])) { http_response_code(400); echo json_encode(['error' => 'no record']); exit; }
            // upsert по дате — одна запись на день
            $found = false;
            foreach ($d['records'] as &$r) {
                if ($r['date'] === $rec['date']) { $r = $rec; $found = true; break; }
            }
            unset($r);
            if (!$found) $d['records'][] = $rec;
            save_data($DATA, $d);
            echo json_encode(['ok' => true]);
            break;

        case 'delete_record':
            $id = $body['id'] ?? '';
            $d['records'] = array_values(array_filter($d['records'], function ($r) use ($id) {
                return ($r['id'] ?? '') !== $id;
            }));
            save_data($DATA, $d);
            echo json_encode(['ok' => true]);
            break;

        case 'save_config':
            $cfg = $body['config'] ?? null;
            if (!is_array($cfg)) { http_response_code(400); echo json_encode(['error' => 'no config']); exit; }
            $d['config'] = $cfg;
            save_data($DATA, $d);
            echo json_encode(['ok' => true]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'unknown action']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);
