// ============================================================
// HelpDesk 3-tier: CI Pipeline (Phase 3)
// Checkout -> Check -> Build 2 images -> Trivy scan -> Push
// Kubernetes deploy ki stage Phase 5 mein add hogi.
//
// Jenkins Credential: dockerhub-creds (Username/Password = Docker Hub token)
// ============================================================
pipeline {
    agent any

    options {
        disableConcurrentBuilds()                          // ek waqt mein ek hi build
        timeout(time: 30, unit: 'MINUTES')                 // atak jaye to khud ruk jaye
        buildDiscarder(logRotator(numToKeepStr: '10'))     // sirf aakhri 10 builds rakho
    }

    environment {
        DOCKERHUB_USER = 'ahbdoc'
        BACKEND_IMAGE  = "${DOCKERHUB_USER}/helpdesk-backend"
        FRONTEND_IMAGE = "${DOCKERHUB_USER}/helpdesk-frontend"
        IMAGE_TAG      = "${BUILD_NUMBER}"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install and Check Backend') {
            steps {
                dir('backend') {
                    // npm ci: package-lock.json ke exact versions install karta hai
                    sh 'npm ci'
                    sh 'node --check server.js'
                }
            }
        }

        stage('Build Images') {
            steps {
                // --pull: base image ka sabse naya version lo, purani cache wali nahi
                sh '''
                    docker build --pull -t ${BACKEND_IMAGE}:${IMAGE_TAG} -t ${BACKEND_IMAGE}:latest ./backend
                    docker build --pull -t ${FRONTEND_IMAGE}:${IMAGE_TAG} -t ${FRONTEND_IMAGE}:latest ./frontend
                '''
            }
        }

        stage('Security Scan (Trivy)') {
            steps {
                sh '''
                    for IMG in ${BACKEND_IMAGE}:${IMAGE_TAG} ${FRONTEND_IMAGE}:${IMAGE_TAG}; do
                      echo "=== REPORT (HIGH, CRITICAL) for $IMG ==="
                      docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache \
                        aquasec/trivy:latest image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0 "$IMG"

                      echo "=== GATE (CRITICAL with a fix available) for $IMG ==="
                      docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache \
                        aquasec/trivy:latest image --severity CRITICAL --ignore-unfixed --exit-code 1 "$IMG"
                    done
                '''
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest
                    '''
                }
            }
        }

        stage('Cleanup') {
            steps {
                sh 'docker image prune -f || true'
            }
        }
    }

    post {
        success {
            echo "Pushed ${BACKEND_IMAGE}:${IMAGE_TAG} and ${FRONTEND_IMAGE}:${IMAGE_TAG}"
        }
        failure {
            echo 'Pipeline failed: dekho kaunsi stage red hui.'
        }
        always {
            sh 'docker logout || true'
        }
    }
}
