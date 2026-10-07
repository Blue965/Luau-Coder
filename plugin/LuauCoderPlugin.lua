local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")

local BRIDGE_URL = "http://127.0.0.1:37842/api/plugin/poll"
local MAX_SOURCE_LENGTH = 40000

local toolbar = plugin:CreateToolbar("Luau Coder")
local toggleButton = toolbar:CreateButton(
	"LuauCoder",
	"Ouvrir l’assistant Luau Coder",
	"",
	"Luau Coder"
)
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Float,
	false,
	false,
	390,
	470,
	330,
	360
)
local widget = plugin:CreateDockWidgetPluginGuiAsync("LuauCoderWidget", widgetInfo)
widget.Title = "Luau Coder"

local root = Instance.new("Frame")
root.Name = "Root"
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(17, 18, 24)
root.BorderSizePixel = 0
root.Parent = widget

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 15)
padding.PaddingBottom = UDim.new(0, 15)
padding.PaddingLeft = UDim.new(0, 15)
padding.PaddingRight = UDim.new(0, 15)
padding.Parent = root

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local function makeLabel(name, text, height, color, textSize, order)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.Size = UDim2.new(1, 0, 0, height)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.Gotham
	label.Text = text
	label.TextColor3 = color or Color3.fromRGB(215, 213, 225)
	label.TextSize = textSize or 12
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Center
	label.TextWrapped = true
	label.LayoutOrder = order or #root:GetChildren()
	label.Parent = root
	return label
end

local function makeButton(name, text, order)
	local button = Instance.new("TextButton")
	button.Name = name
	button.Size = UDim2.new(1, 0, 0, 34)
	button.BackgroundColor3 = Color3.fromRGB(105, 82, 164)
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamMedium
	button.Text = text
	button.TextColor3 = Color3.fromRGB(248, 246, 255)
	button.TextSize = 12
	button.LayoutOrder = order
	button.Parent = root
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = button
	return button
end

local title = makeLabel("Title", "Assistant Luau Coder", 23, Color3.fromRGB(244, 241, 250), 16, 1)
title.Font = Enum.Font.GothamBold

local statusLabel = makeLabel("Status", "Colle le code d’association affiché dans l’application.", 28, Color3.fromRGB(150, 149, 164), 11, 2)

local tokenBox = Instance.new("TextBox")
tokenBox.Name = "PairingCode"
tokenBox.Size = UDim2.new(1, 0, 0, 34)
tokenBox.BackgroundColor3 = Color3.fromRGB(11, 12, 16)
tokenBox.BorderSizePixel = 0
tokenBox.ClearTextOnFocus = false
tokenBox.Font = Enum.Font.Code
tokenBox.PlaceholderText = "Code d’association"
tokenBox.Text = ""
tokenBox.TextColor3 = Color3.fromRGB(225, 221, 240)
tokenBox.TextSize = 11
tokenBox.LayoutOrder = 3
tokenBox.Parent = root
local tokenCorner = Instance.new("UICorner")
tokenCorner.CornerRadius = UDim.new(0, 5)
tokenCorner.Parent = tokenBox

local pairButton = makeButton("Pair", "Enregistrer le code", 4)
local targetLabel = makeLabel("Target", "Script sélectionné : aucun", 24, Color3.fromRGB(132, 131, 145), 10, 5)
local operationLabel = makeLabel("Operation", "Les suggestions reçues apparaîtront ici.", 30, Color3.fromRGB(202, 199, 213), 11, 6)

local preview = Instance.new("TextBox")
preview.Name = "CodePreview"
preview.Size = UDim2.new(1, 0, 0, 110)
preview.BackgroundColor3 = Color3.fromRGB(11, 12, 16)
preview.BorderSizePixel = 0
preview.ClearTextOnFocus = false
preview.Font = Enum.Font.Code
preview.MultiLine = true
preview.Text = ""
preview.TextEditable = false
preview.TextColor3 = Color3.fromRGB(171, 211, 181)
preview.TextSize = 11
preview.TextWrapped = false
preview.TextXAlignment = Enum.TextXAlignment.Left
preview.TextYAlignment = Enum.TextYAlignment.Top
preview.Visible = false
preview.LayoutOrder = 7
preview.Parent = root
local previewPadding = Instance.new("UIPadding")
previewPadding.PaddingTop = UDim.new(0, 9)
previewPadding.PaddingBottom = UDim.new(0, 9)
previewPadding.PaddingLeft = UDim.new(0, 9)
previewPadding.PaddingRight = UDim.new(0, 9)
previewPadding.Parent = preview
local previewCorner = Instance.new("UICorner")
previewCorner.CornerRadius = UDim.new(0, 5)
previewCorner.Parent = preview

local applyButton = makeButton("Apply", "Confirmer le remplacement", 8)
applyButton.BackgroundColor3 = Color3.fromRGB(62, 126, 112)
applyButton.Visible = false

local cancelButton = makeButton("Cancel", "Annuler la suggestion", 9)
cancelButton.BackgroundColor3 = Color3.fromRGB(54, 55, 66)
cancelButton.Visible = false

local savedToken = plugin:GetSetting("PairingToken")
if typeof(savedToken) == "string" then
	tokenBox.Text = savedToken
end

local currentToken = ""
local acknowledgedId = nil
local currentOperation = nil
local currentTarget = nil
local running = true
local requestInProgress = false

local function setStatus(text, color)
	statusLabel.Text = text
	statusLabel.TextColor3 = color or Color3.fromRGB(150, 149, 164)
end

local function clearOperation(message)
	currentOperation = nil
	currentTarget = nil
	preview.Text = ""
	preview.Visible = false
	applyButton.Visible = false
	cancelButton.Visible = false
	operationLabel.Text = message
end

local function showOperation(operation, target)
	currentOperation = operation
	currentTarget = target
	operationLabel.Text = "Suggestion reçue pour " .. operation.targetPath .. ". Relis le code puis confirme."
	preview.Text = operation.code
	preview.Visible = true
	applyButton.Visible = true
	cancelButton.Visible = true
end

local function getSelectedScript()
	local selected = Selection:Get()
	local target = selected[1]
	if not target or not target:IsA("LuaSourceContainer") then
		return nil, nil, "Sélectionne un Script, LocalScript ou ModuleScript."
	end

	local ok, sourceOrError = pcall(function()
		return target.Source
	end)
	if not ok then
		return nil, target, "Studio n’a pas permis de lire le script sélectionné."
	end
	if #sourceOrError > MAX_SOURCE_LENGTH then
		return nil, target, "Le script sélectionné dépasse 40 000 caractères."
	end

	return {
		name = target.Name,
		className = target.ClassName,
		path = target:GetFullName(),
		source = sourceOrError,
	}, target, nil
end

local function pollApplication()
	if currentToken == "" or requestInProgress then
		return
	end

	requestInProgress = true
	local scriptContext, selectedTarget, contextError = getSelectedScript()
	if contextError then
		targetLabel.Text = "Script sélectionné : indisponible"
	else
		targetLabel.Text = scriptContext
			and ("Script sélectionné : " .. scriptContext.path)
			or "Script sélectionné : aucun"
	end

	local body = HttpService:JSONEncode({
		script = scriptContext,
		acknowledgedId = acknowledgedId,
	})
	local ok, responseOrError = pcall(function()
		return HttpService:RequestAsync({
			Url = BRIDGE_URL,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = "Bearer " .. currentToken,
			},
			Body = body,
		})
	end)

	if not ok then
		setStatus("Application introuvable. Lance Luau Coder sur ce PC.")
		requestInProgress = false
		return
	end

	local response = responseOrError
	if not response.Success then
		if response.StatusCode == 401 then
			setStatus("Code invalide. Colle le code actuel de l’application.", Color3.fromRGB(226, 164, 136))
		else
			local detail = ""
			if response.StatusCode == 400 then
				local decodedOk, payload = pcall(function()
					return HttpService:JSONDecode(response.Body)
				end)
				if decodedOk and typeof(payload) == "table" and typeof(payload.error) == "string" then
					detail = ": " .. string.sub(payload.error, 1, 100)
				end
			end
			setStatus("Connexion locale refusée (HTTP " .. tostring(response.StatusCode) .. ")" .. detail .. ".", Color3.fromRGB(226, 164, 136))
		end
		requestInProgress = false
		return
	end

	local decodedOk, payload = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)
	if not decodedOk or typeof(payload) ~= "table" then
		setStatus("Réponse de l’application invalide.", Color3.fromRGB(226, 164, 136))
		requestInProgress = false
		return
	end

	setStatus(contextError or "Connecté à Luau Coder.", contextError and Color3.fromRGB(226, 164, 136) or Color3.fromRGB(112, 230, 211))
	if acknowledgedId then
		acknowledgedId = nil
	end

	local operation = payload.operation
	if typeof(operation) == "table" and typeof(operation.id) == "string" then
		if not currentOperation or currentOperation.id ~= operation.id then
			local activeSelection = Selection:Get()
			local activeTarget = activeSelection[1]
			if
				activeTarget
				and activeTarget:IsA("LuaSourceContainer")
				and activeTarget:GetFullName() == operation.targetPath
				and scriptContext
				and selectedTarget == activeTarget
			then
				acknowledgedId = operation.id
				showOperation(operation, activeTarget)
			else
				operationLabel.Text = "Dans l’application, renvoie le code après avoir sélectionné le script cible."
			end
		end
	end
	requestInProgress = false
end

pairButton.Activated:Connect(function()
	local token = tokenBox.Text:gsub("%s", "")
	if #token < 32 or #token > 128 then
		setStatus("Le code d’association ne semble pas valide.", Color3.fromRGB(226, 164, 136))
		return
	end
	plugin:SetSetting("PairingToken", token)
	currentToken = token
	setStatus("Code enregistré. Connexion à l’application…")
end)

applyButton.Activated:Connect(function()
	if not currentOperation or not currentTarget then
		setStatus("Aucune suggestion à appliquer.", Color3.fromRGB(226, 164, 136))
		return
	end
	local selected = Selection:Get()
	if
		selected[1] ~= currentTarget
		or not currentTarget:IsDescendantOf(game)
		or currentTarget:GetFullName() ~= currentOperation.targetPath
	then
		clearOperation("La sélection a changé. Renvoie le code depuis l’application avec le bon script sélectionné.")
		setStatus("Application annulée : la sélection ne correspond plus.", Color3.fromRGB(226, 164, 136))
		return
	end

	local ok, applyError = pcall(function()
		currentTarget.Source = currentOperation.code
	end)
	if not ok then
		setStatus("Studio n’a pas pu modifier le script : " .. tostring(applyError), Color3.fromRGB(226, 164, 136))
		return
	end

	clearOperation("Code appliqué à " .. currentTarget.Name .. ". Tu peux annuler avec Ctrl+Z dans Studio.")
	setStatus("Script mis à jour.", Color3.fromRGB(112, 230, 211))
end)

cancelButton.Activated:Connect(function()
	clearOperation("Suggestion annulée. Le script n’a pas été modifié.")
end)

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

plugin.Unloading:Connect(function()
	running = false
end)

task.spawn(function()
	while running do
		local saved = plugin:GetSetting("PairingToken")
		if currentToken == "" and typeof(saved) == "string" then
			currentToken = saved
		end
		pollApplication()
		task.wait(2)
	end
end)
