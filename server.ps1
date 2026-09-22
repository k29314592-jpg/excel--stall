# ==============================================================================
# EXCEL SCHOOL STALL – DIGITAL WALLET & SALES TRACKER
# Native High-Performance PowerShell / .NET HTTP Server & REST API
# Excel Matriculation Hr. Sec. School
# ==============================================================================

param(
    [int]$Port = 8888
)

$baseDir = $PSScriptRoot
$dataDir = Join-Path $baseDir "data"
$dbFile = Join-Path $dataDir "database.json"

if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

# Auto-detect local network IP address for mobile devices
$localIps = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | 
    Where-Object { 
        $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and 
        !$_.IPAddressToString.StartsWith("127.") 
    }

$lanIp = "localhost"
if ($localIps -and $localIps.Count -gt 0) {
    $lanIp = $localIps[0].IPAddressToString
}

Write-Output ""
Write-Output "======================================================================"
Write-Output "   EXCEL MATRICULATION HR. SEC. SCHOOL - SCHOOL STALL EVENT SERVER    "
Write-Output "               DIGITAL WALLET & SALES TRACKER SYSTEM                  "
Write-Output "======================================================================"
Write-Output " Status       : SERVER IS ACTIVE & READY!"
Write-Output " Computer URL : http://localhost:$Port/"
Write-Output " Phone / LAN  : http://${lanIp}:$Port/"
Write-Output " Database     : $dbFile"
Write-Output "======================================================================"
Write-Output " Press Ctrl + C to stop the server at any time."
Write-Output ""

# Load database helper functions
$lockObj = New-Object System.Object

function Get-Database {
    [System.Threading.Monitor]::Enter($lockObj)
    try {
        if (Test-Path $dbFile) {
            $raw = [System.IO.File]::ReadAllText($dbFile, [System.Text.Encoding]::UTF8)
            return ($raw | ConvertFrom-Json)
        }
        return $null
    } finally {
        [System.Threading.Monitor]::Exit($lockObj)
    }
}

function Save-Database($db) {
    [System.Threading.Monitor]::Enter($lockObj)
    try {
        $json = $db | ConvertTo-Json -Depth 10
        $tmpFile = "$dbFile.tmp"
        [System.IO.File]::WriteAllText($tmpFile, $json, [System.Text.Encoding]::UTF8)
        if (Test-Path $dbFile) { Remove-Item $dbFile -Force }
        Move-Item -Path $tmpFile -Destination $dbFile -Force
    } finally {
        [System.Threading.Monitor]::Exit($lockObj)
    }
}

# Start TCP Listener
$ip = [System.Net.IPAddress]::Any
$listener = New-Object System.Net.Sockets.TcpListener($ip, $Port)

try {
    $listener.Start()
} catch {
    Write-Output "Port $Port is busy, trying fallback port 8085..."
    $Port = 8085
    $listener = New-Object System.Net.Sockets.TcpListener($ip, $Port)
    $listener.Start()
    Write-Output "Running on http://localhost:$Port/ and http://${lanIp}:$Port/"
}

function Send-Response($stream, [int]$statusCode, [string]$statusMsg, [string]$contentType, [byte[]]$bodyBytes) {
    $header = "HTTP/1.1 $statusCode $statusMsg`r`n" +
              "Content-Type: $contentType`r`n" +
              "Content-Length: $($bodyBytes.Length)`r`n" +
              "Access-Control-Allow-Origin: *`r`n" +
              "Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE`r`n" +
              "Access-Control-Allow-Headers: Content-Type, Authorization`r`n" +
              "Cache-Control: no-cache`r`n" +
              "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length -gt 0) {
        $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }
    $stream.Flush()
}

function Send-JsonResponse($stream, [int]$statusCode, [string]$statusMsg, $obj) {
    $json = $obj | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    Send-Response $stream $statusCode $statusMsg "application/json; charset=utf-8" $bytes
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
            
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($requestLine)) {
                $client.Close()
                continue
            }

            $lineParts = $requestLine.Split(' ')
            if ($lineParts.Length -lt 2) {
                $client.Close()
                continue
            }

            $method = $lineParts[0].ToUpper()
            $rawPath = $lineParts[1]
            $urlPath = $rawPath.Split('?')[0]

            # Read request headers
            $headers = @{}
            $contentLength = 0
            while ($true) {
                $headerLine = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($headerLine)) { break }
                $colonIdx = $headerLine.IndexOf(':')
                if ($colonIdx -gt 0) {
                    $hName = $headerLine.Substring(0, $colonIdx).Trim().ToLower()
                    $hVal = $headerLine.Substring($colonIdx + 1).Trim()
                    $headers[$hName] = $hVal
                    if ($hName -eq "content-length") {
                        $contentLength = [int]$hVal
                    }
                }
            }

            # Read Body if POST / PUT / DELETE
            $bodyString = ""
            if ($contentLength -gt 0) {
                $charBuffer = New-Object char[] $contentLength
                $totalRead = 0
                while ($totalRead -lt $contentLength) {
                    $read = $reader.Read($charBuffer, $totalRead, $contentLength - $totalRead)
                    if ($read -le 0) { break }
                    $totalRead += $read
                }
                $bodyString = New-Object string ($charBuffer, 0, $totalRead)
            }

            # Handle CORS OPTIONS
            if ($method -eq "OPTIONS") {
                Send-Response $stream 200 "OK" "text/plain" (New-Object byte[] 0)
                $client.Close()
                continue
            }

            # ==================================================================
            # REST API ROUTES
            # ==================================================================

            # GET /api/data
            if ($method -eq "GET" -and $urlPath -eq "/api/data") {
                $db = Get-Database
                if ($null -eq $db) {
                    Send-JsonResponse $stream 500 "Internal Server Error" @{ success = $false; error = "Database not found" }
                } else {
                    Send-JsonResponse $stream 200 "OK" $db
                }
                $client.Close()
                continue
            }

            # POST /api/purchase
            if ($method -eq "POST" -and $urlPath -eq "/api/purchase") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database

                $student = $null
                foreach ($s in $db.students) {
                    if ($s.id -eq $req.studentId) { $student = $s; break }
                }

                $stall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.stallId) { $stall = $st; break }
                }

                if (!$student) {
                    Send-JsonResponse $stream 400 "Bad Request" @{ success = $false; error = "Student not found" }
                    $client.Close()
                    continue
                }

                if (!$stall) {
                    Send-JsonResponse $stream 400 "Bad Request" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                $product = $null
                if ($req.productId -eq "custom" -or $req.isCustom) {
                    $customName = if ($req.productName) { $req.productName.Trim() } else { "Custom Item" }
                    $customPrice = [double]$req.price
                    if ($customPrice -le 0) { $customPrice = 10 }
                    $product = [PSCustomObject]@{
                        id = "CUSTOM"
                        name = $customName
                        price = $customPrice
                    }
                    if ($req.saveToMenu) {
                        $newP = [PSCustomObject]@{
                            id = "P" + ("{0:D2}" -f (Get-Random -Minimum 10 -Maximum 99))
                            name = $customName
                            price = $customPrice
                        }
                        $pList = New-Object System.Collections.ArrayList
                        if ($stall.products) { $pList.AddRange($stall.products) }
                        $pList.Add($newP) | Out-Null
                        $stall.products = $pList.ToArray()
                    }
                } else {
                    foreach ($p in $stall.products) {
                        if ($p.id -eq $req.productId -or $p.name -eq $req.productId) { $product = $p; break }
                    }
                }

                if (!$product) {
                    Send-JsonResponse $stream 400 "Bad Request" @{ success = $false; error = "Product not found" }
                    $client.Close()
                    continue
                }

                $qty = [int]$req.quantity
                if ($qty -le 0) { $qty = 1 }
                $unitPrice = [double]$product.price
                $totalAmount = $unitPrice * $qty

                if ([double]$student.balance -lt $totalAmount) {
                    Send-JsonResponse $stream 400 "Bad Request" @{ 
                        success = $false
                        error = "Insufficient Balance"
                        required = $totalAmount
                        available = $student.balance
                    }
                    $client.Close()
                    continue
                }

                # Deduct balance
                $student.balance = [double]$student.balance - $totalAmount
                $student.totalSpent = [double]$student.totalSpent + $totalAmount
                $student.transactionsCount = [int]$student.transactionsCount + 1

                # Update Stall
                $stall.totalSales = [double]$stall.totalSales + $totalAmount
                $stall.transactionsCount = [int]$stall.transactionsCount + 1
                $stall.itemsSold = [int]$stall.itemsSold + $qty

                # Generate Unique Transaction ID
                $nextSeq = 1001 + ($db.transactions.Count)
                $txnId = "TXN" + $nextSeq

                $now = Get-Date
                $timeStr = $now.ToString("hh:mm tt")
                $dateStr = $now.ToString("yyyy-MM-dd")

                $newTxn = [PSCustomObject]@{
                    id = $txnId
                    studentId = $student.id
                    studentName = $student.name
                    stallId = $stall.id
                    stallName = $stall.name
                    product = $product.name
                    quantity = $qty
                    price = $unitPrice
                    amount = $totalAmount
                    time = $timeStr
                    date = $dateStr
                    remainingBalance = $student.balance
                    status = "COMPLETED"
                }

                # Prepend to transactions list
                $txnList = New-Object System.Collections.ArrayList
                $txnList.AddRange($db.transactions)
                $txnList.Insert(0, $newTxn)
                $db.transactions = $txnList.ToArray()

                Save-Database $db

                Send-JsonResponse $stream 200 "OK" @{
                    success = $true
                    message = "Purchase successful"
                    transaction = $newTxn
                    data = $db
                }
                $client.Close()
                continue
            }

            # POST /api/reverse (Admin Undo)
            if ($method -eq "POST" -and $urlPath -eq "/api/reverse") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $txnToReverse = $null
                foreach ($t in $db.transactions) {
                    if ($t.id -eq $req.transactionId) { $txnToReverse = $t; break }
                }

                if (!$txnToReverse) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Transaction not found" }
                    $client.Close()
                    continue
                }

                if ($txnToReverse.status -eq "REVERSED") {
                    Send-JsonResponse $stream 400 "Bad Request" @{ success = $false; error = "Transaction is already reversed" }
                    $client.Close()
                    continue
                }

                # Refund Student
                $student = $null
                foreach ($s in $db.students) {
                    if ($s.id -eq $txnToReverse.studentId) { $student = $s; break }
                }
                if ($student) {
                    $student.balance = [double]$student.balance + [double]$txnToReverse.amount
                    $student.totalSpent = [Math]::Max(0, [double]$student.totalSpent - [double]$txnToReverse.amount)
                    $student.transactionsCount = [Math]::Max(0, [int]$student.transactionsCount - 1)
                }

                # Roll back Stall
                $stall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $txnToReverse.stallId) { $stall = $st; break }
                }
                if ($stall) {
                    $stall.totalSales = [Math]::Max(0, [double]$stall.totalSales - [double]$txnToReverse.amount)
                    $stall.transactionsCount = [Math]::Max(0, [int]$stall.transactionsCount - 1)
                    $stall.itemsSold = [Math]::Max(0, [int]$stall.itemsSold - [int]$txnToReverse.quantity)
                }

                $txnToReverse.status = "REVERSED"
                Save-Database $db

                Send-JsonResponse $stream 200 "OK" @{
                    success = $true
                    message = "Transaction $($req.transactionId) reversed and balance refunded"
                    data = $db
                }
                $client.Close()
                continue
            }

            # POST /api/students (Add new student)
            if ($method -eq "POST" -and $urlPath -eq "/api/students") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database

                $newId = "STU" + ("{0:D3}" -f ($db.students.Count + 1))
                if ($req.id -and !([string]::IsNullOrWhiteSpace($req.id))) {
                    $newId = $req.id.Trim().ToUpper()
                }

                $startBal = [double]$req.startingBalance
                if ($startBal -le 0) { $startBal = 100 }

                $newStudent = [PSCustomObject]@{
                    id = $newId
                    name = $req.name
                    class = $req.class
                    section = $req.section
                    startingBalance = $startBal
                    balance = $startBal
                    totalSpent = 0
                    transactionsCount = 0
                }

                $stuList = New-Object System.Collections.ArrayList
                $stuList.AddRange($db.students)
                $stuList.Add($newStudent) | Out-Null
                $db.students = $stuList.ToArray()

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; student = $newStudent; data = $db }
                $client.Close()
                continue
            }

            # POST /api/students/edit or PUT /api/students
            if (($method -eq "POST" -and $urlPath -eq "/api/students/edit") -or ($method -eq "PUT" -and $urlPath -eq "/api/students")) {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $found = $null
                foreach ($s in $db.students) {
                    if ($s.id -eq $req.id) { $found = $s; break }
                }

                if (!$found) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Student not found" }
                    $client.Close()
                    continue
                }

                if ($req.name) { $found.name = $req.name }
                if ($req.class) { $found.class = $req.class }
                if ($req.section) { $found.section = $req.section }
                if ($null -ne $req.balance) { $found.balance = [double]$req.balance }
                if ($null -ne $req.startingBalance) { $found.startingBalance = [double]$req.startingBalance }

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; student = $found; data = $db }
                $client.Close()
                continue
            }

            # POST /api/students/topup (Manual Add Funds to Student)
            if ($method -eq "POST" -and $urlPath -eq "/api/students/topup") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $found = $null
                foreach ($s in $db.students) {
                    if ($s.id -eq $req.studentId) { $found = $s; break }
                }

                if (!$found) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Student not found" }
                    $client.Close()
                    continue
                }

                $topupAmt = [double]$req.amount
                if ($topupAmt -le 0) { $topupAmt = 50 }

                $found.balance = [double]$found.balance + $topupAmt
                $found.startingBalance = [double]$found.startingBalance + $topupAmt

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; student = $found; message = "Added ₹$topupAmt to $($found.name)"; data = $db }
                $client.Close()
                continue
            }

            # POST /api/students/delete or DELETE /api/students
            if (($method -eq "POST" -and $urlPath -eq "/api/students/delete") -or ($method -eq "DELETE" -and $urlPath -eq "/api/students")) {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $stuList = New-Object System.Collections.ArrayList
                $removed = $false
                foreach ($s in $db.students) {
                    if ($s.id -eq $req.id) {
                        $removed = $true
                    } else {
                        $stuList.Add($s) | Out-Null
                    }
                }

                if (!$removed) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Student not found" }
                    $client.Close()
                    continue
                }

                $db.students = $stuList.ToArray()
                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; message = "Student deleted"; data = $db }
                $client.Close()
                continue
            }

            # POST /api/students/allocate (Bulk allocate starting money)
            if ($method -eq "POST" -and $urlPath -eq "/api/students/allocate") {
                $req = $bodyString | ConvertFrom-Json
                $allocAmount = [double]$req.amount
                if ($allocAmount -le 0) { $allocAmount = 100 }

                $db = Get-Database
                foreach ($s in $db.students) {
                    if ($req.mode -eq "add") {
                        $s.balance = [double]$s.balance + $allocAmount
                        $s.startingBalance = [double]$s.startingBalance + $allocAmount
                    } else {
                        # Reset / set starting balance
                        $s.startingBalance = $allocAmount
                        $s.balance = $allocAmount
                        $s.totalSpent = 0
                        $s.transactionsCount = 0
                    }
                }

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; message = "Allocated ₹$allocAmount to all students"; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls (Add new stall)
            if ($method -eq "POST" -and $urlPath -eq "/api/stalls") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database

                $newStallId = "STALL" + ("{0:D2}" -f ($db.stalls.Count + 1))
                $prods = @()
                if ($req.products) {
                    $prods = $req.products
                }

                $newStall = [PSCustomObject]@{
                    id = $newStallId
                    name = $req.name
                    team = $req.team
                    totalSales = 0
                    transactionsCount = 0
                    itemsSold = 0
                    products = $prods
                }

                $stallList = New-Object System.Collections.ArrayList
                $stallList.AddRange($db.stalls)
                $stallList.Add($newStall) | Out-Null
                $db.stalls = $stallList.ToArray()

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; stall = $newStall; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls/edit or PUT /api/stalls
            if (($method -eq "POST" -and $urlPath -eq "/api/stalls/edit") -or ($method -eq "PUT" -and $urlPath -eq "/api/stalls")) {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $foundStall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.id) { $foundStall = $st; break }
                }

                if (!$foundStall) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                if ($req.name) { $foundStall.name = $req.name }
                if ($req.team) { $foundStall.team = $req.team }

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; stall = $foundStall; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls/delete or DELETE /api/stalls
            if (($method -eq "POST" -and $urlPath -eq "/api/stalls/delete") -or ($method -eq "DELETE" -and $urlPath -eq "/api/stalls")) {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $stallList = New-Object System.Collections.ArrayList
                $removed = $false
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.id) {
                        $removed = $true
                    } else {
                        $stallList.Add($st) | Out-Null
                    }
                }

                if (!$removed) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                $db.stalls = $stallList.ToArray()
                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; message = "Stall deleted"; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls/products/add (Add product to stall)
            if ($method -eq "POST" -and $urlPath -eq "/api/stalls/products/add") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $stall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.stallId) { $stall = $st; break }
                }

                if (!$stall) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                $prodSeq = $stall.products.Count + 1
                $prodId = "P" + ("{0:D2}" -f (Get-Random -Minimum 10 -Maximum 99))
                $newProd = [PSCustomObject]@{
                    id = $prodId
                    name = $req.name
                    price = [double]$req.price
                }

                $prodList = New-Object System.Collections.ArrayList
                if ($stall.products) { $prodList.AddRange($stall.products) }
                $prodList.Add($newProd) | Out-Null
                $stall.products = $prodList.ToArray()

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; product = $newProd; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls/products/edit (Edit product price/name)
            if ($method -eq "POST" -and $urlPath -eq "/api/stalls/products/edit") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $stall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.stallId) { $stall = $st; break }
                }

                if (!$stall) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                $foundProd = $null
                foreach ($p in $stall.products) {
                    if ($p.id -eq $req.productId) { $foundProd = $p; break }
                }

                if (!$foundProd) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Product not found" }
                    $client.Close()
                    continue
                }

                if ($req.name) { $foundProd.name = $req.name }
                if ($null -ne $req.price) { $foundProd.price = [double]$req.price }

                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; product = $foundProd; data = $db }
                $client.Close()
                continue
            }

            # POST /api/stalls/products/delete (Delete product from stall)
            if ($method -eq "POST" -and $urlPath -eq "/api/stalls/products/delete") {
                $req = $bodyString | ConvertFrom-Json
                $db = Get-Database
                $stall = $null
                foreach ($st in $db.stalls) {
                    if ($st.id -eq $req.stallId) { $stall = $st; break }
                }

                if (!$stall) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Stall not found" }
                    $client.Close()
                    continue
                }

                $prodList = New-Object System.Collections.ArrayList
                $removed = $false
                foreach ($p in $stall.products) {
                    if ($p.id -eq $req.productId) {
                        $removed = $true
                    } else {
                        $prodList.Add($p) | Out-Null
                    }
                }

                if (!$removed) {
                    Send-JsonResponse $stream 404 "Not Found" @{ success = $false; error = "Product not found" }
                    $client.Close()
                    continue
                }

                $stall.products = $prodList.ToArray()
                Save-Database $db
                Send-JsonResponse $stream 200 "OK" @{ success = $true; message = "Product removed"; data = $db }
                $client.Close()
                continue
            }

            # ==================================================================
            # STATIC FILE SERVING
            # ==================================================================
            if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
                $urlPath = "/index.html"
            }

            $safeRelPath = $urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::Combine($baseDir, $safeRelPath)

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($ext) {
                    '.html' { 'text/html; charset=utf-8' }
                    '.css'  { 'text/css; charset=utf-8' }
                    '.js'   { 'application/javascript; charset=utf-8' }
                    '.json' { 'application/json; charset=utf-8' }
                    '.png'  { 'image/png' }
                    '.jpg'  { 'image/jpeg' }
                    '.jpeg' { 'image/jpeg' }
                    '.svg'  { 'image/svg+xml' }
                    '.ico'  { 'image/x-icon' }
                    '.webmanifest' { 'application/manifest+json' }
                    Default { 'application/octet-stream' }
                }

                $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                Send-Response $stream 200 "OK" $mime $fileBytes
            } else {
                $notFoundText = "404 - File Not Found: $urlPath"
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes($notFoundText)
                Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" $notFoundBytes
            }

            $client.Close()
        } catch {
            if ($client.Connected) {
                $client.Close()
            }
        }
    }
} finally {
    $listener.Stop()
}
