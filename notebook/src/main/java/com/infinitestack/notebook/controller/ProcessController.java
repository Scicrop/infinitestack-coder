package com.infinitestack.notebook.controller;

import com.infinitestack.notebook.dto.RunPythonRequest;
import com.infinitestack.notebook.service.PythonProcessService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/process")
@CrossOrigin(origins = "*")
public class ProcessController {

    private final PythonProcessService pythonProcessService;

    public ProcessController(PythonProcessService pythonProcessService) {
        this.pythonProcessService = pythonProcessService;
    }

    @PostMapping("/run")
    public ResponseEntity<String> runProcess(@RequestBody RunPythonRequest request) {

        if (request.getScript() == null || request.getScript().isBlank()) {
            return ResponseEntity.badRequest().body("Campo 'script' é obrigatório.");
        }

        String script = request.getScript();
        String parameter = request.getParameter(); // pode ser null

        pythonProcessService.runPythonScriptAsync(script, parameter);

        System.out.println("Iniciando script: " + script + " param: " + parameter);
        return ResponseEntity.accepted().body("Processo iniciado para script: " + script);
    }
}
